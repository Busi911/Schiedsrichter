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
});
