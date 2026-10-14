// Integrationstest: Auswärtsspiele als Termine für eigene Dienste (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const mailSpy = vi.fn();
// withTenant gegen die lokale Test-Datenbank: als app_user mit gesetzter Mandanten-Variable, also MIT den RLS-Regeln.
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
vi.mock("@/lib/mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));

const JETZT = new Date("2026-10-14T10:00:00Z");
const ANWURF = new Date("2026-10-24T16:00:00Z");

describe.skipIf(!ADMIN_URL)("Auswärtsspiele als Termine (Postgres)", () => {
  const vereinId = randomUUID();
  let gruppeId: string;
  let ligaMannschaftId: string;
  let mannschaftId: string;
  let auswaertsSpielId: string;
  let heimSpielId: string;
  let dienstId: string;
  let personId: string;

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSV Auswärts", ligaUebernahmeAktiv: true });
    const [lv] = await testDb
      .insert(schema.ligaVereine)
      .values({ vereinId, slug: `tsv-auswaerts-${vereinId.slice(0, 8)}`, name: "TSV Auswärts" })
      .returning({ id: schema.ligaVereine.id });
    const [g] = await testDb
      .insert(schema.ligaGruppen)
      .values({ nuligaGroupId: `g-${vereinId}`, championship: "HHV 26/27", ligaName: "Bezirksliga" })
      .returning({ id: schema.ligaGruppen.id });
    gruppeId = g.id;
    const [lm] = await testDb
      .insert(schema.ligaMannschaften)
      .values({ ligaVereinId: lv.id, slug: "maenner", schluessel: "herren::1", name: "Männer", kategorie: "herren" })
      .returning({ id: schema.ligaMannschaften.id });
    ligaMannschaftId = lm.id;
    await testDb.insert(schema.ligaTeilnahmen).values({ mannschaftId: ligaMannschaftId, gruppeId, saison: "2026/27", nuligaTeamtableId: "111", nuligaName: "Männer" });
    const [m] = await testDb
      .insert(schema.mannschaften)
      .values({ vereinId, name: "Männer", ligaMannschaftId })
      .returning({ id: schema.mannschaften.id });
    mannschaftId = m.id;
    const spiele = await testDb
      .insert(schema.ligaSpiele)
      .values([
        // Auswärtsspiel: eigenes Team als Gast
        { gruppeId, spielnummer: 1, datum: "2026-10-24", uhrzeit: "18:00", beginn: ANWURF, halleName: "Halle Gegner", heimName: "HSG Gegner", gastName: "TSV Auswärts", heimTeamtableId: "222", gastTeamtableId: "111" },
        // Heimspiel: nie ein Auswärts-Termin
        { gruppeId, spielnummer: 2, datum: "2026-10-31", uhrzeit: "18:00", beginn: new Date("2026-10-31T17:00:00Z"), halleName: "Eigene Halle", heimName: "TSV Auswärts", gastName: "HSG Gegner", heimTeamtableId: "111", gastTeamtableId: "222" },
      ])
      .returning({ id: schema.ligaSpiele.id, nr: schema.ligaSpiele.spielnummer });
    auswaertsSpielId = spiele.find((s) => s.nr === 1)!.id;
    heimSpielId = spiele.find((s) => s.nr === 2)!.id;
    const [p] = await testDb
      .insert(schema.users)
      .values({ email: `fahrer-${randomUUID()}@example.test`, name: "Fahrer Eins", vereinId })
      .returning({ id: schema.users.id });
    personId = p.id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen).where(eq(schema.ligaGruppen.id, gruppeId));
    await pool.end();
    await appPool.end();
  });
  beforeEach(async () => {
    mailSpy.mockClear();
    await testDb.delete(schema.termine).where(eq(schema.termine.vereinId, vereinId));
    await testDb.delete(schema.dienstArten).where(eq(schema.dienstArten.vereinId, vereinId));
    await testDb
      .update(schema.ligaSpiele)
      .set({ beginn: ANWURF, uhrzeit: "18:00", halleName: "Halle Gegner", status: "geplant", toreHeim: null, toreGast: null, ergebnisBestaetigt: false })
      .where(eq(schema.ligaSpiele.id, auswaertsSpielId));
    const [d] = await testDb
      .insert(schema.dienstArten)
      .values({ vereinId, name: "Fahrer", bedarfAuswaerts: 2 })
      .returning({ id: schema.dienstArten.id });
    dienstId = d.id;
  });

  const auswaertsTermine = () =>
    testDb.select().from(schema.termine).where(and(eq(schema.termine.vereinId, vereinId), eq(schema.termine.typ, "auswaertsspiel")));
  const pflege = async () => (await import("./auswaerts-termine")).pflegeAuswaertsTermine(vereinId, JETZT);

  it("legt nur das Auswärtsspiel an, einmal, mit Mannschaft und Halle", async () => {
    expect((await pflege()).angelegt).toBe(1);
    expect((await pflege()).angelegt).toBe(0);
    const t = await auswaertsTermine();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ ligaSpielId: auswaertsSpielId, mannschaftId, ort: "Halle Gegner", icsUid: `liga:${auswaertsSpielId}` });
    expect(t[0].start.getTime()).toBe(ANWURF.getTime());
    const heim = await testDb.select().from(schema.termine).where(eq(schema.termine.ligaSpielId, heimSpielId));
    expect(heim).toHaveLength(0);
  });

  it("ohne Dienst für Auswärtsspiele wird nichts angelegt; fällt der Dienst weg, verschwindet ein leerer Termin", async () => {
    await testDb.update(schema.dienstArten).set({ bedarfAuswaerts: 0, bedarfHeim: 2 }).where(eq(schema.dienstArten.id, dienstId));
    expect((await pflege()).angelegt).toBe(0);
    await testDb.update(schema.dienstArten).set({ bedarfAuswaerts: 2 }).where(eq(schema.dienstArten.id, dienstId));
    await pflege();
    await testDb.update(schema.dienstArten).set({ aktiv: false }).where(eq(schema.dienstArten.id, dienstId));
    expect((await pflege()).entfernt).toBe(1);
    expect(await auswaertsTermine()).toHaveLength(0);
  });

  it("mit Einteilung bleibt der Termin, auch wenn der Dienst wegfällt", async () => {
    await pflege();
    const [t] = await auswaertsTermine();
    await testDb.insert(schema.terminZuordnungen).values({ terminId: t.id, userId: personId, funktionstraegerTyp: "eigener_dienst", dienstArtId: dienstId, quelle: "zugeordnet_durch_admin" });
    await testDb.update(schema.dienstArten).set({ aktiv: false }).where(eq(schema.dienstArten.id, dienstId));
    expect((await pflege()).entfernt).toBe(0);
    expect(await auswaertsTermine()).toHaveLength(1);
  });

  it("Verlegung: neue Zeit, Einteilungen entfallen, Eingeteilte mit Login bekommen eine Mail", async () => {
    await pflege();
    const [t] = await auswaertsTermine();
    await testDb.insert(schema.terminZuordnungen).values([
      { terminId: t.id, userId: personId, funktionstraegerTyp: "eigener_dienst", dienstArtId: dienstId, quelle: "zugeordnet_durch_admin" },
      { terminId: t.id, externerName: "Ohne Login", funktionstraegerTyp: "eigener_dienst", dienstArtId: dienstId, quelle: "zugeordnet_durch_admin" },
    ]);
    const neu = new Date("2026-10-25T13:00:00Z");
    await testDb.update(schema.ligaSpiele).set({ beginn: neu, status: "verlegt" }).where(eq(schema.ligaSpiele.id, auswaertsSpielId));
    expect((await pflege()).verlegt).toBe(1);
    const [nachher] = await auswaertsTermine();
    expect(nachher.start.getTime()).toBe(neu.getTime());
    expect(await testDb.select().from(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, t.id))).toHaveLength(0);
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(String(mailSpy.mock.calls[0][2])).toContain("Fahrer");
  });

  it("nur andere Halle: Ort wird angepasst, Einteilungen bleiben, keine Mail", async () => {
    await pflege();
    const [t] = await auswaertsTermine();
    await testDb.insert(schema.terminZuordnungen).values({ terminId: t.id, userId: personId, funktionstraegerTyp: "eigener_dienst", dienstArtId: dienstId, quelle: "zugeordnet_durch_admin" });
    await testDb.update(schema.ligaSpiele).set({ halleName: "Ausweichhalle" }).where(eq(schema.ligaSpiele.id, auswaertsSpielId));
    expect((await pflege()).ortGeaendert).toBe(1);
    expect((await auswaertsTermine())[0].ort).toBe("Ausweichhalle");
    expect(await testDb.select().from(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, t.id))).toHaveLength(1);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("Absage: Termin entfällt, Eingeteilte bekommen eine Mail, kein neuer Termin", async () => {
    await pflege();
    const [t] = await auswaertsTermine();
    await testDb.insert(schema.terminZuordnungen).values({ terminId: t.id, userId: personId, funktionstraegerTyp: "eigener_dienst", dienstArtId: dienstId, quelle: "zugeordnet_durch_admin" });
    await testDb.update(schema.ligaSpiele).set({ status: "abgesagt" }).where(eq(schema.ligaSpiele.id, auswaertsSpielId));
    const r = await pflege();
    expect(r).toMatchObject({ abgesagt: 1, angelegt: 0 });
    expect(await auswaertsTermine()).toHaveLength(0);
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(String(mailSpy.mock.calls[0][1])).toContain("abgesagt");
  });
});
