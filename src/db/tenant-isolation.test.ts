// Integration-Test für die Mandantentrennung (Row-Level-Security, siehe
// migrations/0001_enable_rls_multi_tenant.sql). Anders als der Rest der
// Testsuite (reine Unit-Tests ohne DB) braucht dieser Test eine ECHTE
// Postgres-Instanz mit angewendeten Migrationen — und wird deshalb
// standardmäßig übersprungen, wenn keine bereitsteht (kein Blocker für
// "npm test" ohne DB, z.B. auf einem frischen Rechner oder in CI ohne
// Postgres-Service).
//
// Zum lokalen Ausführen: eine Postgres-Instanz mit zwei Rollen anlegen,
// analog zu migrations/0002_app_user_role.sql (siehe README für den
// Produktiv-Rollen-Aufbau):
//   - eine Owner-Rolle MIT bypassrls (für Migrationen/adminDb) — hier alle
//     46 Migrationen aus src/db/migrations in Journal-Reihenfolge anwenden
//   - "app_user" OHNE bypassrls (für den regulären App-Traffic; wird von
//     Migration 0002 selbst angelegt, nur noch Passwort setzen)
// Dann:
//   TEST_DATABASE_ADMIN_URL=postgres://<owner>:<pw>@localhost:5432/<db> \
//   TEST_DATABASE_URL=postgres://app_user:<pw>@localhost:5432/<db> \
//   npx vitest run src/db/tenant-isolation.test.ts
//
// Bewusst mit "pg" (node-postgres) statt @neondatabase/serverless: Letzteres
// spricht ausschließlich WebSocket und braucht dafür lokal einen
// Proxy-Sidecar (ws-postgres-proxy) — für diesen Test unnötiger
// Infrastruktur-Aufwand, da RLS eine reine Postgres-Server-Eigenschaft ist
// und unabhängig vom Transport der App gilt. Geprüft wird hier exakt der
// Mechanismus, den withTenant() in db/index.ts verwendet: pro Transaktion
// `select set_config('app.current_verein_id', <id>, true)`.
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const APP_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!ADMIN_URL || !APP_URL)("Mandantentrennung (RLS)", () => {
  const adminPool = new Pool({ connectionString: ADMIN_URL });
  const appPool = new Pool({ connectionString: APP_URL });

  // Entspricht withTenant() in db/index.ts: current_verein_id gilt nur
  // innerhalb dieser einen Transaktion (SET LOCAL-Semantik via dritten
  // Parameter "true" von set_config).
  async function withTenant<T>(
    vereinId: string,
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("select set_config('app.current_verein_id', $1, true)", [
        vereinId,
      ]);
      const ergebnis = await fn(client);
      await client.query("COMMIT");
      return ergebnis;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  let vereinA: string;
  let vereinB: string;
  let mannschaftA: string;
  let terminB: string;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    vereinA = randomUUID();
    vereinB = randomUUID();
    await adminPool.query(
      `insert into verein (id, name) values ($1, 'Test-Verein A'), ($2, 'Test-Verein B')`,
      [vereinA, vereinB]
    );

    const { rows: mRows } = await adminPool.query(
      `insert into mannschaft (verein_id, name) values ($1, 'Herren 1') returning id`,
      [vereinA]
    );
    mannschaftA = mRows[0].id;

    const { rows: tRows } = await adminPool.query(
      `insert into termin (verein_id, typ, start, quelle)
       values ($1, 'testspiel', now(), 'manuell') returning id`,
      [vereinB]
    );
    terminB = tRows[0].id;
    await adminPool.query(
      `insert into termin_zuordnung (termin_id, externer_name, funktionstraeger_typ, quelle)
       values ($1, 'Gast-Schiri B', 'schiedsrichter', 'zugeordnet_durch_admin')`,
      [terminB]
    );

    // "user".id hat nur einen anwendungsseitigen Default (crypto.randomUUID()
    // in schema.ts, kein DB-DEFAULT) — bei einem rohen SQL-Insert hier daher
    // explizit mitgeben.
    userA = randomUUID();
    userB = randomUUID();
    await adminPool.query(
      `insert into "user" (id, email, verein_id) values ($1, $2, $3), ($4, $5, $6)`,
      [
        userA,
        `a-${vereinA}@example.test`,
        vereinA,
        userB,
        `b-${vereinB}@example.test`,
        vereinB,
      ]
    );
  });

  afterAll(async () => {
    // cascade räumt mannschaft/termin/termin_zuordnung/user mit auf (siehe
    // onDelete: "cascade" in schema.ts).
    await adminPool.query(`delete from verein where id in ($1, $2)`, [
      vereinA,
      vereinB,
    ]);
    await adminPool.end();
    await appPool.end();
  });

  it("liefert ohne current_verein_id KEINE Zeilen (fail closed statt alles freizugeben)", async () => {
    const client = await appPool.connect();
    try {
      // Bewusst OHNE set_config — simuliert Code, der versehentlich db.query
      // statt withTenant(...) verwendet.
      const { rows } = await client.query(
        "select id from mannschaft where id = $1",
        [mannschaftA]
      );
      expect(rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it("zeigt in withTenant(vereinA) nur Mannschaften von Verein A, nicht von B", async () => {
    const gesehenA = await withTenant(vereinA, async (client) => {
      const { rows } = await client.query("select id, verein_id from mannschaft");
      return rows;
    });
    expect(gesehenA.map((r) => r.id)).toEqual([mannschaftA]);

    const gesehenB = await withTenant(vereinB, async (client) => {
      const { rows } = await client.query("select id from mannschaft where id = $1", [
        mannschaftA,
      ]);
      return rows;
    });
    expect(gesehenB).toHaveLength(0);
  });

  it("lehnt das Anlegen einer Mannschaft mit fremder verein_id ab (WITH CHECK)", async () => {
    await expect(
      withTenant(vereinA, (client) =>
        client.query(
          "insert into mannschaft (verein_id, name) values ($1, 'Fremd-Einschleusung')",
          [vereinB]
        )
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it("termin_zuordnung (Join-Policy über termin) respektiert dieselbe Grenze", async () => {
    const ausSichtA = await withTenant(vereinA, async (client) => {
      const { rows } = await client.query(
        "select id from termin_zuordnung where termin_id = $1",
        [terminB]
      );
      return rows;
    });
    expect(ausSichtA).toHaveLength(0);

    const ausSichtB = await withTenant(vereinB, async (client) => {
      const { rows } = await client.query(
        "select id from termin_zuordnung where termin_id = $1",
        [terminB]
      );
      return rows;
    });
    expect(ausSichtB).toHaveLength(1);
  });

  it("\"user\" hat bewusst KEINE RLS — Anwendungscode muss selbst nach verein_id filtern", async () => {
    // Dokumentiert die in migrations/0001 beschriebene Ausnahme: ohne
    // eigenen WHERE-Filter sieht man hier BEIDE Vereine. Schlägt dieser Test
    // künftig fehl, weil "user" nun doch RLS bekommen hat, ist das ein
    // gewollter Anlass, die zahlreichen manuellen eq(users.vereinId, ...)
    // Filter im Code (siehe admin/actions.ts) auf Redundanz zu prüfen statt
    // blind den Test anzupassen.
    const ohneFilter = await withTenant(vereinA, async (client) => {
      const { rows } = await client.query(
        'select id from "user" where id in ($1, $2)',
        [userA, userB]
      );
      return rows;
    });
    expect(ohneFilter.map((r) => r.id).sort()).toEqual([userA, userB].sort());

    // Mit explizitem Filter (der von der App überall verwendete Weg) ist
    // die Trennung trotz fehlender RLS korrekt.
    const mitFilter = await withTenant(vereinA, async (client) => {
      const { rows } = await client.query(
        'select id from "user" where verein_id = $1',
        [vereinA]
      );
      return rows;
    });
    expect(mitFilter.map((r) => r.id)).toEqual([userA]);
  });

  it("eigene Dienste (dienst_art, dienst_art_mannschaft, termin_dienst_bedarf) sind je Verein getrennt", async () => {
    const { rows } = await adminPool.query(
      `insert into dienst_art (verein_id, name) values ($1, 'Fahrer B') returning id`,
      [vereinB]
    );
    const dienstB = rows[0].id;
    await adminPool.query(`insert into termin_dienst_bedarf (termin_id, dienst_art_id, verein_id, bedarf) values ($1, $2, $3, 2)`, [
      terminB,
      dienstB,
      vereinB,
    ]);

    const ausSichtA = await withTenant(vereinA, async (client) => {
      const arten = await client.query("select id from dienst_art where id = $1", [dienstB]);
      const bedarf = await client.query("select bedarf from termin_dienst_bedarf where dienst_art_id = $1", [dienstB]);
      return { arten: arten.rows, bedarf: bedarf.rows };
    });
    expect(ausSichtA.arten).toHaveLength(0);
    expect(ausSichtA.bedarf).toHaveLength(0);

    const ausSichtB = await withTenant(vereinB, async (client) => {
      const { rows: r } = await client.query("select id from dienst_art where id = $1", [dienstB]);
      return r;
    });
    expect(ausSichtB).toHaveLength(1);

    // Verein A kann weder einen Dienst für B anlegen noch seine Mannschaft in B's Dienst einschleusen.
    await expect(
      withTenant(vereinA, (client) => client.query("insert into dienst_art (verein_id, name) values ($1, 'Fremd')", [vereinB]))
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withTenant(vereinA, (client) =>
        client.query("insert into dienst_art_mannschaft (dienst_art_id, mannschaft_id, verein_id) values ($1, $2, $3)", [
          dienstB,
          mannschaftA,
          vereinB,
        ])
      )
    ).rejects.toThrow(/row-level security/i);
  });

  it("Fahrgemeinschaft (fahrt_mitfahrer) ist je Verein getrennt", async () => {
    const { rows } = await adminPool.query(
      `insert into termin_zuordnung (termin_id, externer_name, funktionstraeger_typ, quelle, plaetze)
       values ($1, 'Fahrer B', 'eigener_dienst', 'zugeordnet_durch_admin', 3) returning id`,
      [terminB]
    );
    const zuordnungB = rows[0].id;
    await adminPool.query(`insert into fahrt_mitfahrer (zuordnung_id, verein_id, name) values ($1, $2, 'Kind B')`, [zuordnungB, vereinB]);

    const ausSichtA = await withTenant(vereinA, (client) =>
      client.query("select name from fahrt_mitfahrer where zuordnung_id = $1", [zuordnungB]).then((r) => r.rows)
    );
    expect(ausSichtA).toHaveLength(0);
    const ausSichtB = await withTenant(vereinB, (client) =>
      client.query("select name from fahrt_mitfahrer where zuordnung_id = $1", [zuordnungB]).then((r) => r.rows)
    );
    expect(ausSichtB).toEqual([{ name: "Kind B" }]);

    // Verein A kann B keinen Mitfahrer unterschieben.
    await expect(
      withTenant(vereinA, (client) =>
        client.query("insert into fahrt_mitfahrer (zuordnung_id, verein_id, name) values ($1, $2, 'Fremd')", [zuordnungB, vereinB])
      )
    ).rejects.toThrow(/row-level security/i);
  });
  it("Trainingsausfälle (training_ausfall) sind je Verein getrennt", async () => {
    const { rows: m } = await adminPool.query(`insert into mannschaft (verein_id, name) values ($1, 'Herren B') returning id`, [vereinB]);
    const { rows: h } = await adminPool.query(`insert into halle (verein_id, name) values ($1, 'Halle B') returning id`, [vereinB]);
    const { rows: z } = await adminPool.query(
      `insert into trainingszeit (verein_id, mannschaft_id, halle_id, wochentag, start_minuten, end_minuten) values ($1, $2, $3, 2, 1080, 1170) returning id`,
      [vereinB, m[0].id, h[0].id]
    );
    await adminPool.query(`insert into training_ausfall (verein_id, trainingszeit_id, datum, grund) values ($1, $2, '2030-01-02', 'Halle gesperrt')`, [
      vereinB,
      z[0].id,
    ]);

    const ausSichtA = await withTenant(vereinA, (client) =>
      client.query("select grund from training_ausfall where trainingszeit_id = $1", [z[0].id]).then((r) => r.rows)
    );
    expect(ausSichtA).toHaveLength(0);
    const ausSichtB = await withTenant(vereinB, (client) =>
      client.query("select grund from training_ausfall where trainingszeit_id = $1", [z[0].id]).then((r) => r.rows)
    );
    expect(ausSichtB).toEqual([{ grund: "Halle gesperrt" }]);

    // Verein A kann B keinen Ausfall unterschieben.
    await expect(
      withTenant(vereinA, (client) =>
        client.query("insert into training_ausfall (verein_id, trainingszeit_id, datum) values ($1, $2, '2030-01-09')", [vereinB, z[0].id])
      )
    ).rejects.toThrow(/row-level security/i);

    // Pro Training und Datum nur ein Ausfall (Doppelklick-Schutz).
    await expect(
      withTenant(vereinB, (client) =>
        client.query("insert into training_ausfall (verein_id, trainingszeit_id, datum) values ($1, $2, '2030-01-02')", [vereinB, z[0].id])
      )
    ).rejects.toThrow(/duplicate|unique/i);
  });
  it("Vereinstermine (vereinstermin, -sichtbar, -antwort) sind je Verein getrennt", async () => {
    const { rows: t } = await adminPool.query(
      `insert into vereinstermin (verein_id, titel, start, sichtbarkeit, serie_id, wiederholung) values ($1, 'Sitzung B', '2030-01-02T18:00:00Z', 'auswahl', gen_random_uuid(), 'monatlich') returning id`,
      [vereinB]
    );
    const terminB = t[0].id;
    await adminPool.query(`insert into vereinstermin_sichtbar (vereinstermin_id, verein_id, rolle) values ($1, $2, 'trainer')`, [terminB, vereinB]);
    await adminPool.query(`insert into vereinstermin_antwort (vereinstermin_id, user_id, verein_id, antwort) values ($1, $2, $3, 'zusage')`, [terminB, userB, vereinB]);

    for (const tabelle of ["vereinstermin", "vereinstermin_sichtbar", "vereinstermin_antwort"]) {
      const spalte = tabelle === "vereinstermin" ? "id" : "vereinstermin_id";
      const ausSichtA = await withTenant(vereinA, (client) => client.query(`select 1 from ${tabelle} where ${spalte} = $1`, [terminB]).then((r) => r.rows));
      expect(ausSichtA, tabelle).toHaveLength(0);
      const ausSichtB = await withTenant(vereinB, (client) => client.query(`select 1 from ${tabelle} where ${spalte} = $1`, [terminB]).then((r) => r.rows));
      expect(ausSichtB, tabelle).toHaveLength(1);
    }

    // Verein A kann B weder Termin noch Antwort unterschieben.
    await expect(
      withTenant(vereinA, (client) => client.query(`insert into vereinstermin (verein_id, titel, start) values ($1, 'Fremd', now())`, [vereinB]))
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withTenant(vereinA, (client) =>
        client.query(`insert into vereinstermin_antwort (vereinstermin_id, user_id, verein_id, antwort) values ($1, $2, $3, 'absage')`, [terminB, userB, vereinB])
      )
    ).rejects.toThrow(/row-level security/i);
  });
  it("Belegungen frei gewordener Trainingszeiten (training_belegung) sind je Verein getrennt", async () => {
    const { rows: m } = await adminPool.query(`insert into mannschaft (verein_id, name) values ($1, 'Belegung B') returning id`, [vereinB]);
    const { rows: h } = await adminPool.query(`insert into halle (verein_id, name) values ($1, 'Halle Belegung B') returning id`, [vereinB]);
    const { rows: z } = await adminPool.query(
      `insert into trainingszeit (verein_id, mannschaft_id, halle_id, wochentag, start_minuten, end_minuten) values ($1, $2, $3, 2, 1080, 1170) returning id`,
      [vereinB, m[0].id, h[0].id]
    );
    await adminPool.query(`insert into training_belegung (verein_id, trainingszeit_id, datum, mannschaft_id, notiz) values ($1, $2, '2030-01-02', $3, 'Testspiel')`, [vereinB, z[0].id, m[0].id]);

    const ausSichtA = await withTenant(vereinA, (client) => client.query("select notiz from training_belegung where trainingszeit_id = $1", [z[0].id]).then((r) => r.rows));
    expect(ausSichtA).toHaveLength(0);
    const ausSichtB = await withTenant(vereinB, (client) => client.query("select notiz from training_belegung where trainingszeit_id = $1", [z[0].id]).then((r) => r.rows));
    expect(ausSichtB).toEqual([{ notiz: "Testspiel" }]);

    // Verein A kann B keine Belegung unterschieben.
    await expect(
      withTenant(vereinA, (client) =>
        client.query("insert into training_belegung (verein_id, trainingszeit_id, datum, mannschaft_id) values ($1, $2, '2030-01-09', $3)", [vereinB, z[0].id, m[0].id])
      )
    ).rejects.toThrow(/row-level security/i);

    // Wer zuerst bucht: je Trainingszeit und Datum nur eine Belegung.
    await expect(
      withTenant(vereinB, (client) =>
        client.query("insert into training_belegung (verein_id, trainingszeit_id, datum, mannschaft_id) values ($1, $2, '2030-01-02', $3)", [vereinB, z[0].id, m[0].id])
      )
    ).rejects.toThrow(/duplicate|unique/i);
  });
  it("Vereinsverwaltung (mitglied, mitglied_mannschaft, beitragsklasse, beitritt_antrag) ist je Verein getrennt", async () => {
    const { rows: mi } = await adminPool.query(`insert into mitglied (verein_id, name, vorname) values ($1, 'Muster', 'Max') returning id`, [vereinB]);
    await adminPool.query(`insert into beitragsklasse (verein_id, name, betrag) values ($1, 'Erwachsene', 12000)`, [vereinB]);
    await adminPool.query(`insert into beitritt_antrag (verein_id, name, vorname, email) values ($1, 'Antrag', 'Anna', 'anna@example.test')`, [vereinB]);

    // Verein A sieht nichts von B, B sieht seine Zeilen.
    for (const tabelle of ["mitglied", "beitragsklasse", "beitritt_antrag"]) {
      const a = await withTenant(vereinA, (client) => client.query(`select id from ${tabelle} where verein_id = $1`, [vereinB]).then((r) => r.rows));
      expect(a, tabelle).toHaveLength(0);
      const b = await withTenant(vereinB, (client) => client.query(`select id from ${tabelle} where verein_id = $1`, [vereinB]).then((r) => r.rows));
      expect(b, tabelle).toHaveLength(1);
    }

    // Verein A kann B keine Mitglieder, Beitragsklassen unterschieben.
    await expect(
      withTenant(vereinA, (client) => client.query(`insert into mitglied (verein_id, name, vorname) values ($1, 'Fremd', 'X')`, [vereinB]))
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withTenant(vereinA, (client) => client.query(`insert into beitragsklasse (verein_id, name, betrag) values ($1, 'Fremd', 1)`, [vereinB]))
    ).rejects.toThrow(/row-level security/i);

    // Ändern/Löschen fremder Anträge wirkt auf 0 Zeilen.
    const geaendert = await withTenant(vereinA, (client) => client.query(`update beitritt_antrag set status = 'abgelehnt' where verein_id = $1`, [vereinB]));
    expect(geaendert.rowCount).toBe(0);
    const geloescht = await withTenant(vereinA, (client) => client.query(`delete from beitritt_antrag where verein_id = $1`, [vereinB]));
    expect(geloescht.rowCount).toBe(0);

    // Mitgliedsarten sind je Verein getrennt; Verein A kann B keine Art unterschieben.
    await adminPool.query(`insert into mitgliedsart (verein_id, name) values ($1, 'Fördermitglied')`, [vereinB]);
    const artenA = await withTenant(vereinA, (client) => client.query(`select id from mitgliedsart where verein_id = $1`, [vereinB]).then((r) => r.rows));
    expect(artenA).toHaveLength(0);
    await expect(
      withTenant(vereinA, (client) => client.query(`insert into mitgliedsart (verein_id, name) values ($1, 'Fremd')`, [vereinB]))
    ).rejects.toThrow(/row-level security/i);

    // Öffentliches Formular: Anlegen für einen Verein ist ohne dessen Mandantenkontext erlaubt (INSERT ohne Einschränkung), Lesen bleibt getrennt.
    await withTenant(vereinA, (client) =>
      client.query(`insert into beitritt_antrag (verein_id, name, vorname, email) values ($1, 'Oeffentlich', 'Olga', 'olga@example.test')`, [vereinB])
    );
    const nachAnlegen = await withTenant(vereinA, (client) => client.query(`select id from beitritt_antrag where verein_id = $1`, [vereinB]).then((r) => r.rows));
    expect(nachAnlegen).toHaveLength(0);

    // mitglied_mannschaft hängt indirekt am Verein des Mitglieds.
    const slug = `mitglied-${randomUUID().slice(0, 8)}`;
    const { rows: lv } = await adminPool.query(`insert into liga_verein (verein_id, slug, name) values ($1, $2, 'Mitglied Test') returning id`, [vereinB, slug]);
    const { rows: team } = await adminPool.query(
      `insert into liga_mannschaft (liga_verein_id, slug, schluessel, name, kategorie) values ($1, 'm1', 'm1', 'Team', (select enumlabel::liga_kategorie from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'liga_kategorie' order by e.enumsortorder limit 1)) returning id`,
      [lv[0].id]
    );
    try {
      await adminPool.query(`insert into mitglied_mannschaft (mitglied_id, mannschaft_id, saison) values ($1, $2, '2030/31')`, [mi[0].id, team[0].id]);
      const mmA = await withTenant(vereinA, (client) => client.query("select id from mitglied_mannschaft where mitglied_id = $1", [mi[0].id]).then((r) => r.rows));
      expect(mmA).toHaveLength(0);
      const mmB = await withTenant(vereinB, (client) => client.query("select id from mitglied_mannschaft where mitglied_id = $1", [mi[0].id]).then((r) => r.rows));
      expect(mmB).toHaveLength(1);
      await expect(
        withTenant(vereinA, (client) =>
          client.query("insert into mitglied_mannschaft (mitglied_id, mannschaft_id, saison) values ($1, $2, '2031/32')", [mi[0].id, team[0].id])
        )
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await adminPool.query(`delete from liga_verein where id = $1`, [lv[0].id]);
    }
  });
});
