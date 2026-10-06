// Integrationstest: Stammdaten am Verein ablegen (ECHTES Postgres, übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { legeLigaVereinAn } from "./sync";
import { speichereStammdaten } from "./stammdaten";
import type { VereinsInfo } from "./types";

vi.mock("server-only", () => ({}));
const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });

const info = (x: Partial<VereinsInfo>): VereinsInfo => ({ name: "HSG Ederbergland", nummer: null, gruendung: null, website: null, stammvereine: [], hallen: [], hallenNummern: {}, logoPfad: null, logoSicher: false, ...x });

describe.skipIf(!ADMIN_URL)("Stammdaten ablegen (Postgres)", () => {
  const vereinId = randomUUID();
  let id: string;
  const zeile = () => testDb.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.id, id) });
  beforeAll(async () => {
    await testDb.delete(schema.ligaVereine).where(eq(schema.ligaVereine.nuligaClubId, "70197"));
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "HSG Ederbergland" });
    id = (await legeLigaVereinAn(testDb, { vereinId, nuligaClubId: "70197", name: "HSG Ederbergland" })).id;
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await pool.end();
  });

  it("legt VNr., Gründungsjahr, https-Website und Stammvereine ab", async () => {
    await speichereStammdaten(testDb, id, info({ nummer: "11159", gruendung: 1995, website: "https://hsg-ederbergland.com", stammvereine: ["TV Beispiel", "TSV Muster"] }));
    expect(await zeile()).toMatchObject({ vereinsnummer: "11159", gruendungsjahr: 1995, website: "https://hsg-ederbergland.com", stammvereine: "TV Beispiel\nTSV Muster" });
    expect((await zeile())!.stammdatenGelesenAm).not.toBeNull();
  });
  it("überschreibt vorhandene Werte nie mit 'nicht gefunden' und lehnt Unsinn ab", async () => {
    await speichereStammdaten(testDb, id, info({ website: "http://unsicher.invalid", gruendung: 1066, nummer: "abc" }));
    expect(await zeile()).toMatchObject({ vereinsnummer: "11159", gruendungsjahr: 1995, website: "https://hsg-ederbergland.com" });
  });
});
