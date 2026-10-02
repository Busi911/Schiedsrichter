// Integrationstest: handball.net-Ansetzung (Schiedsrichter/Zeitnehmer) aus den öffentlichen Daten in
// verknüpfte Termine (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import type { HoleJson } from "@/lib/handball-net/client";
import type { RundenspielEreignis } from "./rundenspiel-import";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
// withTenant gegen die lokale Test-Datenbank (die App nutzt dafür den Neon-WebSocket-Treiber)
const appPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://unused" });
const appDb = drizzle(appPool, { schema });
vi.mock("@/db", () => ({
  db: appDb,
  withTenant: <T,>(vId: string, callback: (tx: typeof appDb) => Promise<T>) =>
    appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_verein_id', ${vId}, true)`);
      return callback(tx as unknown as typeof appDb);
    }),
}));
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

const JETZT = new Date("2020-01-01T00:00:00Z");
const referee = (vor: string, nach: string, rolle: string) => ({ first_name: vor, last_name: nach, role: { name: rolle } });

describe.skipIf(!ADMIN_URL)("handball.net-Ansetzung aus den öffentlichen Daten (Postgres)", () => {
  const vereinId = randomUUID();
  const phaseId = `phase-${randomUUID()}`;
  let terminId: string;
  const angefragt: string[] = [];
  const antwort = (referees: unknown[]): HoleJson => async (pfad) => {
    angefragt.push(pfad);
    return { data: [{ code: "CODE1", referees }, { code: "ANDERES", referees: [referee("X", "Y", "SCHIEDSRICHTER")] }], pagination: { last_page: 1 } };
  };

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "DHB Ansetzung", ligaUebernahmeAktiv: false });
    const [g] = await testDb
      .insert(schema.ligaGruppen)
      .values({ verband: "DHB", quelle: "handball_net", nuligaGroupId: phaseId, championship: "2026/27", ligaName: "3. Liga" })
      .returning({ id: schema.ligaGruppen.id });
    const [s] = await testDb
      .insert(schema.ligaSpiele)
      .values({ gruppeId: g.id, spielcode: "CODE1", quelle: "handball_net", datum: "2030-01-01", heimName: "Heim", gastName: "Gast" })
      .returning({ id: schema.ligaSpiele.id });
    const [t] = await testDb
      .insert(schema.termine)
      .values({ vereinId, typ: "rundenspiel", quelle: "rundenspiel_import", start: new Date("2030-01-01T18:00:00Z"), icsUid: "rundenspiel:99:Heim:Gast:CODE1", heimMannschaftName: "Heim", auswaertsMannschaftName: "Gast", pflichtspiel: true, ligaSpielId: s.id })
      .returning({ id: schema.termine.id });
    terminId = t.id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen).where(eq(schema.ligaGruppen.nuligaGroupId, phaseId));
    await pool.end();
    await appPool.end();
  });
  const termin = async () => (await testDb.select().from(schema.termine).where(eq(schema.termine.id, terminId)))[0];

  it("Schalter aus: nichts; an: Schiedsrichter und Zeitnehmer übernommen, nie gelöscht, idempotent", async () => {
    const { uebernehmeHandballNetAnsetzungen } = await import("./liga-ansetzung-hnet");
    const refs = [referee("Erika", "Muster", "SCHIEDSRICHTER"), referee("Max", "Beispiel", "SCHIEDSRICHTER"), referee("Zita", "Zeit", "ZEITNEHMER")];
    // Default aus
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort(refs), jetzt: JETZT })).toMatchObject({ gruppenGeprueft: 0, aktualisiert: 0 });
    expect((await termin()).handballNetSchiedsrichter).toBeNull();

    await testDb.update(schema.vereine).set({ ligaUebernahmeAktiv: true }).where(eq(schema.vereine.id, vereinId));
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort(refs), jetzt: JETZT })).toMatchObject({ gruppenGeprueft: 1, aktualisiert: 1 });
    let t = await termin();
    expect(t.handballNetSchiedsrichter).toBe("Erika Muster, Max Beispiel");
    expect(t.handballNetZeitnehmer).toBe("Zita Zeit");
    expect(angefragt.at(-1)).toContain(`phase_id=${phaseId}`);
    // zweiter Lauf ändert nichts
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort(refs), jetzt: JETZT })).toMatchObject({ aktualisiert: 0 });
    // öffentlich (noch) keine Ansetzung: nichts löschen
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort([]), jetzt: JETZT })).toMatchObject({ aktualisiert: 0 });
    t = await termin();
    expect(t.handballNetSchiedsrichter).toBe("Erika Muster, Max Beispiel");
    // Änderung der Ansetzung wird übernommen
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort([referee("Neu", "Ersatz", "SCHIEDSRICHTER")]), jetzt: JETZT })).toMatchObject({ aktualisiert: 1 });
    expect((await termin()).handballNetSchiedsrichter).toBe("Neu Ersatz");
    expect((await termin()).handballNetZeitnehmer).toBe("Zita Zeit"); // unverändert
    // Ladefehler gezählt, Termin bleibt; abgelaufene Frist: Phase bleibt übrig
    expect(
      await uebernehmeHandballNetAnsetzungen({
        holeJson: async () => {
          throw new Error("HTTP 503");
        },
        jetzt: JETZT,
      })
    ).toMatchObject({ gruppenFehler: 1, aktualisiert: 0 });
    expect(await uebernehmeHandballNetAnsetzungen({ holeJson: antwort(refs), jetzt: JETZT, frist: Date.now() - 1 })).toMatchObject({ gruppenGeprueft: 0, gruppenUebrig: 1 });
    expect((await termin()).handballNetSchiedsrichter).toBe("Neu Ersatz");
  });

  it("der Hallenplan-/Team-Import überschreibt die Namen bei verknüpften Terminen nicht (Schalter an)", async () => {
    const { importiereRundenspielEreignisse } = await import("./rundenspiel-sync");
    const t0 = await termin();
    const e: RundenspielEreignis = {
      uid: "rundenspiel:99:Heim:Gast:CODE1",
      start: t0.start,
      ort: t0.ort ?? "",
      beschreibung: t0.beschreibung ?? "",
      heimMannschaft: "Heim",
      auswaertsMannschaft: "Gast",
      kategorie: null,
      pflichtspiel: true,
      freundschaftsTyp: null,
      ergebnisHeim: null,
      ergebnisAuswaerts: null,
      schiedsrichterKuerzel: null,
      angesetzterSchiedsrichter: "Veraltet Name",
      angesetzterZeitnehmer: "Veraltet Zeit",
      hatSpielnummer: true,
    };
    await importiereRundenspielEreignisse(vereinId, [e], () => null);
    const t = await termin();
    expect(t.handballNetSchiedsrichter).toBe("Neu Ersatz");
    expect(t.handballNetZeitnehmer).toBe("Zita Zeit");
  });
});
