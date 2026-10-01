// Integrationstest der öffentlichen Abfragen gegen ein ECHTES Postgres
// (übersprungen ohne TEST_DATABASE_ADMIN_URL, siehe nuliga/sync.test.ts):
// Sync mit Fixture-HTML -> holeMannschaften/holeTabelle/Favoriten.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn, synchronisiereStruktur, synchronisiereSpiele, type HoleHtml } from "./nuliga/sync";
import { paramsAusUrl } from "./nuliga/html";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });

// Die öffentlichen Abfragen importieren adminDb (Neon-WebSocket) — für den
// Test durch dieselbe Drizzle-API auf node-postgres ersetzen.
vi.mock("@/db/admin", () => ({ adminDb: testDb }));

const fixture = (n: string) =>
  readFileSync(path.join(import.meta.dirname, "nuliga", "__fixtures__", n), "utf8");

describe.skipIf(!ADMIN_URL)("öffentliche Abfragen (Postgres)", () => {
  const vereinId = randomUUID();
  const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");
  const holeHtml: HoleHtml = async (url) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  };
  let ligaVereinId: string;

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine); // Reste früherer Läufe (gleiche Club-ID)
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSF Heuchelheim" });
    const { id } = await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "69723", name: "TSF Heuchelheim" });
    ligaVereinId = id;
    const jetzt = new Date("2026-10-01T10:00:00Z");
    await synchronisiereStruktur(id, { db: testDb, holeHtml, jetzt });
    await synchronisiereSpiele(id, { db: testDb, holeHtml, jetzt });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("liefert Mannschaften gruppiert, mit Tabellenstand und Spielen", async () => {
    const { holeMannschaften, gruppiereMannschaften, holeVerein } = await import("./liga-oeffentlich");
    expect((await holeVerein("tsf-heuchelheim"))?.id).toBe(ligaVereinId);
    expect(await holeVerein("gibt-es-nicht")).toBeUndefined();

    const mannschaften = await holeMannschaften(ligaVereinId);
    expect(mannschaften).toHaveLength(7);
    expect(gruppiereMannschaften(mannschaften).map((g) => g.titel)).toEqual([
      "Herren",
      "Damen",
      "Männliche Jugend",
      "Kinder / gemischte Jugend",
    ]);

    const d2 = mannschaften.find((m) => m.slug === "maennliche-d-2")!;
    expect(d2.rang).toBe(3);
    expect(d2.punkte).toEqual({ plus: 2, minus: 0 });
    expect(d2.spiele.length).toBeGreaterThan(0);
    // Mannschaften ohne auflösbare Tabellenzeile bleiben mit Stand aus clubTeams sichtbar
    const maenner = mannschaften.find((m) => m.slug === "maenner")!;
    expect(maenner.rang).toBe(5);
    expect(maenner.spiele).toEqual([]);
  });

  it("speichert/liest das Vereinslogo und liefert die Version nur bei vorhandenem Logo", async () => {
    const { holeLogoPng, holeLogoVersion, holeVereinsDesign } = await import("./liga-oeffentlich");
    expect(await holeLogoVersion(ligaVereinId)).toBeNull();
    expect(await holeLogoPng(ligaVereinId)).toBeNull();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await testDb.insert(schema.ligaVereinLogos).values({ ligaVereinId, png, farbton: 224 });
    expect(Buffer.compare((await holeLogoPng(ligaVereinId))!, png)).toBe(0);
    expect(await holeLogoVersion(ligaVereinId)).toBeGreaterThan(0);
    expect((await holeVereinsDesign(ligaVereinId)).farbton).toBe(224);
  });

  it("liefert die Gruppentabelle sortiert nach Rang", async () => {
    const { holeMannschaften, holeTabelle } = await import("./liga-oeffentlich");
    const d2 = (await holeMannschaften(ligaVereinId)).find((m) => m.slug === "maennliche-d-2")!;
    const tabelle = await holeTabelle(d2.gruppeId);
    expect(tabelle.map((z) => z.rang)).toEqual([1, 2, 3, 4]);
  });
});
