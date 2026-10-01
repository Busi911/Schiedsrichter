import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

describe.skipIf(!ADMIN_URL)("Hallenplan-Abgleich laden (Postgres)", () => {
  it("läuft inkl. Trockenlauf ohne SQL-Fehler", async () => {
    const { berechneHallenplanAbgleich } = await import("./hallenplan-abgleich-laden");
    const [v] = await testDb.insert(schema.vereine).values({ name: "Smoke Verein" }).returning({ id: schema.vereine.id });
    const [t] = await testDb
      .insert(schema.termine)
      .values({ vereinId: v.id, typ: "rundenspiel", quelle: "rundenspiel_import", start: new Date(), heimMannschaftName: "A", auswaertsMannschaftName: "B" })
      .returning({ id: schema.termine.id });
    await testDb.insert(schema.terminZuordnungen).values({ terminId: t.id, externerName: "Extern", funktionstraegerTyp: "zeitnehmer", quelle: "zugeordnet_durch_admin" });
    const r = await berechneHallenplanAbgleich();
    const meiner = r.find((x) => x.vereinId === v.id)!;
    expect(meiner.termineGesamt).toBe(1);
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, v.id));
    expect(Array.isArray(r)).toBe(true);
    for (const v of r) expect(v.trockenlauf.verknuepfbar).toBeGreaterThanOrEqual(0);
    await pool.end();
  });
});
