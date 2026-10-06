// Integrationstest der Starthilfe (ECHTES Postgres, übersprungen ohne TEST_DATABASE_ADMIN_URL): ein bereits registrierter Verein
// bekommt die nuLiga-Daten, ohne etwas zu überschreiben, was er selbst eingetragen hat.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { paramsAusUrl } from "./html";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", n), "utf8");
const portrait = fixture("team-portrait.html").replaceAll("2208495", "2242017").replaceAll("491948", "492633");

vi.mock("server-only", () => ({}));
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("./client", () => ({
  holeNuligaHtml: async (url: string) => {
    if (url.includes("/clubTeams")) return fixture("club-teams.html");
    if (url.includes("/groupPage") && paramsAusUrl(url).get("group") === "492633") return fixture("group-page.html");
    if (url.includes("/teamPortrait")) return portrait;
    throw new Error("HTTP 503");
  },
  holeNuligaSeiteMitKontext: async () => ({ html: fixture("vereinsinfo-linden.html"), kontext: { cookie: "a=b", referer: "https://x" } }),
  holeNuligaBild: async () => ({ daten: await sharp({ create: { width: 40, height: 30, channels: 3, background: "#cc0000" } }).png().toBuffer(), contentType: "image/png" }),
}));
vi.mock("@/lib/handball-net/client", () => ({ holeHandballNetApi: async () => ({}) }));

describe.skipIf(!ADMIN_URL)("Starthilfe für einen bestehenden Verein (Postgres)", () => {
  const neuId = randomUUID();
  const eigenId = randomUUID();

  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine);
    await testDb.delete(schema.ligaGruppen);
    await testDb.insert(schema.vereine).values([
      { id: neuId, name: "TSF Heuchelheim", status: "aktiv" },
      { id: eigenId, name: "Hat schon Hallen", status: "aktiv", eigeneHallenNamen: "Meine eigene Halle" },
    ]);
    await testDb.insert(schema.mannschaften).values({ vereinId: eigenId, name: "Herren 1" });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, neuId));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, eigenId));
    await testDb.delete(schema.ligaGruppen);
    await pool.end();
  });

  it("richtet einen Verein ohne Daten komplett ein (Stammdaten, Hallen, Logo, Mannschaften)", async () => {
    const { fuehreNuligaEinrichtungAus } = await import("./einrichtung");
    const schritte = await fuehreNuligaEinrichtungAus({ vereinId: neuId, clubId: "69723", indexName: "TSF Heuchelheim" });
    const status = Object.fromEntries(schritte.map((s) => [s.schluessel, s.status]));
    expect(status).toMatchObject({ gefunden: "ok", stammdaten: "ok", mannschaften: "ok", logo: "ok" });

    const verein = await testDb.query.vereine.findFirst({ where: eq(schema.vereine.id, neuId) });
    expect(verein?.eigeneHallenNamen).toContain("Stadthalle Linden");
    const lv = await testDb.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.vereinId, neuId) });
    expect(lv).toMatchObject({ vereinsnummer: "14194", gruendungsjahr: 2019, nuligaClubId: "69723" });
    expect(await testDb.select().from(schema.mannschaften).where(eq(schema.mannschaften.vereinId, neuId))).toHaveLength(7);
    expect(await testDb.query.ligaVereinLogos.findFirst({ where: eq(schema.ligaVereinLogos.ligaVereinId, lv!.id) })).toMatchObject({ quelle: "nuliga" });
  });

  it("überschreibt eigene Spielhallen nicht und ergänzt keine Mannschaften, wenn der Verein eigene pflegt", async () => {
    const { fuehreNuligaEinrichtungAus } = await import("./einrichtung");
    await testDb.delete(schema.ligaVereine).where(eq(schema.ligaVereine.nuligaClubId, "69723"));
    const schritte = await fuehreNuligaEinrichtungAus({ vereinId: eigenId, clubId: "69723", indexName: "Hat schon Hallen" });
    const verein = await testDb.query.vereine.findFirst({ where: eq(schema.vereine.id, eigenId) });
    expect(verein?.eigeneHallenNamen).toBe("Meine eigene Halle");
    expect(schritte.find((s) => s.schluessel === "hallen")?.detail).toContain("schon eigene");
    expect(await testDb.select().from(schema.mannschaften).where(eq(schema.mannschaften.vereinId, eigenId))).toHaveLength(1);
  });
});
