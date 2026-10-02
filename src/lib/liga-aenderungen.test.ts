// Integrationstest: Verlegungen/Ergebnisse aus den öffentlichen Liga-Daten in verknüpfte Termine
// (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereSpiele, synchronisiereStruktur, type HoleHtml } from "./nuliga/sync";
import { paramsAusUrl } from "./nuliga/html";
import type { RundenspielEreignis } from "./rundenspiel-import";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const mailSpy = vi.fn();
// withTenant gegen die lokale Test-Datenbank (die App nutzt dafür den Neon-WebSocket-Treiber):
// als app_user und mit gesetzter Mandanten-Variable, also MIT den RLS-Regeln.
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

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "nuliga", "__fixtures__", n), "utf8");
const JETZT = new Date("2020-01-01T00:00:00Z");

describe.skipIf(!ADMIN_URL)("Verlegungen und Ergebnisse aus den öffentlichen Daten (Postgres)", () => {
  const vereinId = randomUUID();
  const personEmail = `person-${randomUUID()}@example.test`;
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  let spiel: typeof schema.ligaSpiele.$inferSelect;
  let terminId: string;
  let startOriginal: Date;
  let personId: string;

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine);
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSF Änderungen", ligaUebernahmeAktiv: true });
    const { id } = await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "69723", name: "TSF Änderungen" });
    const jetzt = new Date("2026-10-01T10:00:00Z");
    await synchronisiereStruktur(id, { db: testDb, holeHtml, jetzt });
    await synchronisiereSpiele(id, { db: testDb, holeHtml, jetzt });
    const [s] = await testDb.select().from(schema.ligaSpiele).where(eq(schema.ligaSpiele.spielnummer, 5));
    spiel = s;
    startOriginal = spiel.beginn ?? new Date(`${spiel.datum}T${spiel.uhrzeit ?? "12:00"}:00Z`);
    const [p] = await testDb.insert(schema.users).values({ email: personEmail, name: "Person Eins", vereinId }).returning({ id: schema.users.id });
    personId = p.id;
    const [t] = await testDb
      .insert(schema.termine)
      .values({
        vereinId,
        typ: "rundenspiel",
        quelle: "rundenspiel_import",
        start: startOriginal,
        ort: spiel.halleName,
        icsUid: "rundenspiel:1:Heim:Gast:5",
        heimMannschaftName: spiel.heimName,
        auswaertsMannschaftName: spiel.gastName,
        pflichtspiel: true,
        ligaSpielId: spiel.id,
        nuligaSchiedsrichterKuerzel: "Mue.",
      })
      .returning({ id: schema.termine.id });
    terminId = t.id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
    await appPool.end();
  });
  beforeEach(async () => {
    mailSpy.mockClear();
    // Grundzustand: Termin = öffentliches Spiel, ohne Ergebnis; drei Dienste
    await testDb.update(schema.ligaSpiele).set({ beginn: startOriginal, halleName: spiel.halleName, status: "geplant", toreHeim: null, toreGast: null }).where(eq(schema.ligaSpiele.id, spiel.id));
    await testDb.update(schema.termine).set({ start: startOriginal, ort: spiel.halleName, ergebnisHeim: null, ergebnisAuswaerts: null }).where(eq(schema.termine.id, terminId));
    await testDb.delete(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, terminId));
    await testDb.insert(schema.terminZuordnungen).values([
      { terminId, userId: personId, funktionstraegerTyp: "zeitnehmer", quelle: "zugeordnet_durch_admin" },
      { terminId, externerName: "Extern", funktionstraegerTyp: "sekretaer", quelle: "zugeordnet_durch_admin" },
      { terminId, externerName: "Schiri", funktionstraegerTyp: "schiedsrichter", quelle: "zugeordnet_durch_admin" },
    ]);
  });

  const termin = async () => (await testDb.select().from(schema.termine).where(eq(schema.termine.id, terminId)))[0];
  const dienste = async () =>
    (await testDb.select().from(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, terminId))).map((z) => z.funktionstraegerTyp).sort();

  it("ohne öffentliche Änderung bleibt alles unverändert (kein Protokoll, keine Mail)", async () => {
    const { uebernehmeAenderungen } = await import("./liga-aenderungen");
    const r = await uebernehmeAenderungen(vereinId, "test", JETZT);
    expect(r).toMatchObject({ geprueft: 1, verlegt: 0, ergebnisse: 0 });
    expect(await dienste()).toEqual(["schiedsrichter", "sekretaer", "zeitnehmer"]);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("nur eine andere Halle (gleiche Zeit) ist keine Verlegung", async () => {
    const { uebernehmeAenderungen } = await import("./liga-aenderungen");
    await testDb.update(schema.ligaSpiele).set({ halleName: "Ganz andere Halle" }).where(eq(schema.ligaSpiele.id, spiel.id));
    const r = await uebernehmeAenderungen(vereinId, "test", JETZT);
    expect(r.verlegt).toBe(0);
    expect((await termin()).ort).toBe(spiel.halleName);
    expect(await dienste()).toHaveLength(3);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("neue Zeit: Termin wird verlegt, Dienste außer Schiedsrichter entfallen, Person wird benachrichtigt", async () => {
    const { uebernehmeAenderungen } = await import("./liga-aenderungen");
    const neu = new Date(startOriginal.getTime() + 2 * 3600_000);
    await testDb.update(schema.ligaSpiele).set({ beginn: neu, halleName: "Neue Halle", status: "verlegt" }).where(eq(schema.ligaSpiele.id, spiel.id));
    const r = await uebernehmeAenderungen(vereinId, "test", JETZT);
    expect(r).toMatchObject({ verlegt: 1, entfernteZuordnungen: 1 });
    const t = await termin();
    expect(t.start.getTime()).toBe(neu.getTime());
    expect(t.ort).toBe("Neue Halle");
    expect(t.nuligaSchiedsrichterKuerzel).toBe("Mue."); // Ansetzung unberührt
    expect(await dienste()).toEqual(["schiedsrichter"]);
    // genau eine Mail: an die betroffene Person (Admin-Opt-in ist aus)
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(mailSpy.mock.calls[0][0]).toBe(personEmail);
    // zweiter Lauf: nichts mehr zu tun
    mailSpy.mockClear();
    expect((await uebernehmeAenderungen(vereinId, "test", JETZT)).verlegt).toBe(0);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("ein bereits begonnener/vergangener Termin wird nicht mehr verlegt", async () => {
    const { uebernehmeAenderungen } = await import("./liga-aenderungen");
    await testDb.update(schema.ligaSpiele).set({ beginn: new Date(startOriginal.getTime() + 3600_000) }).where(eq(schema.ligaSpiele.id, spiel.id));
    const r = await uebernehmeAenderungen(vereinId, "test", new Date(startOriginal.getTime() + 24 * 3600_000));
    expect(r.verlegt).toBe(0);
    expect((await termin()).start.getTime()).toBe(startOriginal.getTime());
  });

  it("Ergebnis wird übernommen (Dienste unberührt, keine Mail); falsche Richtung nicht", async () => {
    const { uebernehmeAenderungen } = await import("./liga-aenderungen");
    await testDb.update(schema.ligaSpiele).set({ toreHeim: 27, toreGast: 21 }).where(eq(schema.ligaSpiele.id, spiel.id));
    const r = await uebernehmeAenderungen(vereinId, "test", JETZT);
    expect(r).toMatchObject({ verlegt: 0, ergebnisse: 1 });
    const t = await termin();
    expect([t.ergebnisHeim, t.ergebnisAuswaerts]).toEqual([27, 21]);
    expect(await dienste()).toHaveLength(3);
    expect(mailSpy).not.toHaveBeenCalled();

    // Heim/Gast im Termin vertauscht → kein Ergebnis raten
    await testDb.update(schema.termine).set({ ergebnisHeim: null, ergebnisAuswaerts: null, heimMannschaftName: spiel.gastName, auswaertsMannschaftName: spiel.heimName }).where(eq(schema.termine.id, terminId));
    expect((await uebernehmeAenderungen(vereinId, "test", JETZT)).ergebnisse).toBe(0);
    await testDb.update(schema.termine).set({ heimMannschaftName: spiel.heimName, auswaertsMannschaftName: spiel.gastName }).where(eq(schema.termine.id, terminId));
  });

  it("Hallenplan-Import setzt Zeit/Halle eines verknüpften Termins nicht zurück (Schalter an), sonst schon", async () => {
    const { importiereRundenspielEreignisse } = await import("./rundenspiel-sync");
    const neu = new Date(startOriginal.getTime() + 2 * 3600_000);
    await testDb.update(schema.termine).set({ start: neu, ort: "Neue Halle" }).where(eq(schema.termine.id, terminId));
    const altesEreignis: RundenspielEreignis = {
      uid: "rundenspiel:1:Heim:Gast:5",
      start: startOriginal,
      ort: "Alte Halle",
      beschreibung: "",
      heimMannschaft: spiel.heimName,
      auswaertsMannschaft: spiel.gastName,
      kategorie: null,
      pflichtspiel: true,
      freundschaftsTyp: null,
      ergebnisHeim: null,
      ergebnisAuswaerts: null,
      schiedsrichterKuerzel: null,
      angesetzterSchiedsrichter: null,
      angesetzterZeitnehmer: null,
      hatSpielnummer: true,
    };
    await importiereRundenspielEreignisse(vereinId, [altesEreignis], () => null);
    let t = await termin();
    expect(t.start.getTime()).toBe(neu.getTime());
    expect(t.ort).toBe("Neue Halle");
    expect(t.nuligaSchiedsrichterKuerzel).toBe("Mue.");
    // Schalter aus: der Hallenplan führt wie bisher
    await testDb.update(schema.vereine).set({ ligaUebernahmeAktiv: false }).where(eq(schema.vereine.id, vereinId));
    await importiereRundenspielEreignisse(vereinId, [altesEreignis], () => null);
    t = await termin();
    expect(t.start.getTime()).toBe(startOriginal.getTime());
    expect(t.ort).toBe("Alte Halle");
    await testDb.update(schema.vereine).set({ ligaUebernahmeAktiv: true }).where(eq(schema.vereine.id, vereinId));
  });
});
