// Integrationstest der Verknüpfung (Schritt 2a) gegen ein ECHTES Postgres
// (übersprungen ohne TEST_DATABASE_ADMIN_URL): speichert NUR den Verweis,
// verändert keinen Termin und keine Zuordnung, löscht nichts.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, or } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereSpiele, synchronisiereStruktur, type HoleHtml } from "./nuliga/sync";
import { paramsAusUrl } from "./nuliga/html";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "nuliga", "__fixtures__", n), "utf8");

describe.skipIf(!ADMIN_URL)("Hallenplan verknüpfen (Postgres)", () => {
  const vereinId = randomUUID();
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  let spiel: typeof schema.ligaSpiele.$inferSelect;
  let terminId: string;

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine);
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSF Verknüpfung" });
    const { id } = await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "69723", name: "TSF Verknüpfung" });
    const jetzt = new Date("2026-10-01T10:00:00Z");
    await synchronisiereStruktur(id, { db: testDb, holeHtml, jetzt });
    await synchronisiereSpiele(id, { db: testDb, holeHtml, jetzt });

    const teilnahmen = await testDb
      .select({ tt: schema.ligaTeilnahmen.nuligaTeamtableId })
      .from(schema.ligaTeilnahmen)
      .innerJoin(schema.ligaMannschaften, eq(schema.ligaTeilnahmen.mannschaftId, schema.ligaMannschaften.id))
      .where(eq(schema.ligaMannschaften.ligaVereinId, id));
    const tts = teilnahmen.map((t) => t.tt).filter((x): x is string => !!x);
    const [s] = await testDb
      .select()
      .from(schema.ligaSpiele)
      .where(or(inArray(schema.ligaSpiele.heimTeamtableId, tts), inArray(schema.ligaSpiele.gastTeamtableId, tts)));
    spiel = s;

    const start = spiel.beginn ?? new Date(`${spiel.datum}T${spiel.uhrzeit ?? "12:00"}:00Z`);
    const [t] = await testDb
      .insert(schema.termine)
      .values({
        vereinId,
        typ: "rundenspiel",
        quelle: "rundenspiel_import",
        start,
        ort: "Sporthalle Test",
        heimMannschaftName: spiel.heimName,
        auswaertsMannschaftName: spiel.gastName,
        icsUid: `rundenspiel:1:${spiel.heimName}:${spiel.gastName}:${spiel.spielnummer ?? 0}`,
        nuligaSchiedsrichterKuerzel: "Mue.",
        pflichtspiel: true,
      })
      .returning({ id: schema.termine.id });
    terminId = t.id;
    await testDb
      .insert(schema.terminZuordnungen)
      .values({ terminId, externerName: "Extern Zeitnehmer", funktionstraegerTyp: "zeitnehmer", quelle: "zugeordnet_durch_admin" });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
  });

  const zustand = async () => {
    const [t] = await testDb.select().from(schema.termine).where(eq(schema.termine.id, terminId));
    const z = await testDb.select().from(schema.terminZuordnungen).where(eq(schema.terminZuordnungen.terminId, terminId));
    return { t, z };
  };

  it("setzt nur den Verweis; Termin und Zuordnungen bleiben unverändert; idempotent", async () => {
    const { verknuepfeHallenplanTermine } = await import("./hallenplan-verknuepfung");
    const vorher = await zustand();
    expect(vorher.t.ligaSpielId).toBeNull();

    const r1 = await verknuepfeHallenplanTermine(vereinId, "test");
    expect(r1).toMatchObject({ verknuepft: 1, bereitsVerknuepft: 0, uebersprungenMehrfach: 0 });
    // Kontrollzahl: Dienste vorher = nachher (1 Zuordnung am Test-Termin)
    expect(r1.zuordnungenVorher).toBe(1);
    expect(r1.zuordnungenNachher).toBe(1);
    const nachher = await zustand();
    expect(nachher.t.ligaSpielId).toBe(spiel.id);
    // alles außer dem Verweis unverändert
    expect({ ...nachher.t, ligaSpielId: null }).toEqual({ ...vorher.t, ligaSpielId: null });
    expect(nachher.z).toEqual(vorher.z);

    // Anzeige: der verknüpfte Termin taucht im Bericht auf
    const { berechneHallenplanAbgleich } = await import("./hallenplan-abgleich-laden");
    const bericht = (await berechneHallenplanAbgleich()).find((b) => b.vereinId === vereinId)!;
    expect(bericht.bereitsVerknuepft).toBe(1);
    expect(bericht.verknuepfte).toHaveLength(1);
    expect(bericht.verknuepfte[0]).toMatchObject({ zuordnungen: 1, ansetzung: true });
    // Ampel: der einzige Pflichtspiel-Termin ist zugeordnet
    expect(bericht.trockenlauf).toMatchObject({ pflichtGesamt: 1, pflichtOffen: 0, freundschaftGesamt: 0 });
    expect(bericht.verknuepfte[0].spiel).toContain(spiel.datum);

    const r2 = await verknuepfeHallenplanTermine(vereinId, "test");
    expect(r2).toMatchObject({ verknuepft: 0, bereitsVerknuepft: 1, uebersprungenMehrfach: 0 });
    expect((await zustand()).z).toHaveLength(1);
  });

  it("verknüpft nicht, wenn zwei Termine dasselbe Spiel beanspruchen (Duplikate)", async () => {
    const { verknuepfeHallenplanTermine } = await import("./hallenplan-verknuepfung");
    await testDb.update(schema.termine).set({ ligaSpielId: null }).where(eq(schema.termine.id, terminId));
    const [orig] = await testDb.select().from(schema.termine).where(eq(schema.termine.id, terminId));
    const { id: _id, ...ohneId } = orig;
    void _id;
    const [dup] = await testDb.insert(schema.termine).values({ ...ohneId, ligaSpielId: null }).returning({ id: schema.termine.id });

    const r = await verknuepfeHallenplanTermine(vereinId, "test");
    expect(r.verknuepft).toBe(0);
    expect(r.uebersprungenMehrfach).toBe(2);
    const links = await testDb
      .select({ l: schema.termine.ligaSpielId })
      .from(schema.termine)
      .where(and(eq(schema.termine.vereinId, vereinId), inArray(schema.termine.id, [terminId, dup.id])));
    expect(links.every((x) => x.l === null)).toBe(true);
    await testDb.delete(schema.termine).where(eq(schema.termine.id, dup.id));
  });
});
