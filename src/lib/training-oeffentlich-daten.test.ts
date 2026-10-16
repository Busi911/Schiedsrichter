// Integrationstest: öffentliche Trainings (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { addiereTage, berlinJetzt, wochentagVonDatum } from "./training-ausfall";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

describe.skipIf(!ADMIN_URL)("Öffentliche Trainings (Postgres)", () => {
  const vereinId = randomUUID();
  const anderer = randomUUID();
  let datum: string;

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values([
      { id: vereinId, name: "TSV Öffentlich" },
      { id: anderer, name: "TSV Anderer", trainingOeffentlich: true },
    ]);
    const [m] = await testDb.insert(schema.mannschaften).values({ vereinId, name: "1. Herren", altersklasse: "Mä" }).returning({ id: schema.mannschaften.id });
    const [h] = await testDb.insert(schema.hallen).values({ vereinId, name: "Sporthalle" }).returning({ id: schema.hallen.id });
    datum = addiereTage(berlinJetzt(new Date()).datum, 2);
    const [z] = await testDb
      .insert(schema.trainingszeiten)
      .values({ vereinId, mannschaftId: m.id, halleId: h.id, wochentag: wochentagVonDatum(datum), startMinuten: 1080, endMinuten: 1170 })
      .returning({ id: schema.trainingszeiten.id });
    await testDb.insert(schema.trainingAusfaelle).values({ vereinId, trainingszeitId: z.id, datum, grund: "Trainer krank (intern)" });
    // Ein Training eines anderen Vereins darf nie auftauchen
    const [m2] = await testDb.insert(schema.mannschaften).values({ vereinId: anderer, name: "Fremde Damen" }).returning({ id: schema.mannschaften.id });
    const [h2] = await testDb.insert(schema.hallen).values({ vereinId: anderer, name: "Fremdhalle" }).returning({ id: schema.hallen.id });
    await testDb.insert(schema.trainingszeiten).values({ vereinId: anderer, mannschaftId: m2.id, halleId: h2.id, wochentag: wochentagVonDatum(datum), startMinuten: 600, endMinuten: 660 });
  });

  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, anderer));
    await pool.end();
  });

  it("ohne eingeschalteten Reiter: nichts (null)", async () => {
    const { holeOeffentlicheTrainings } = await import("./training-oeffentlich-daten");
    expect(await holeOeffentlicheTrainings(vereinId)).toBeNull();
  });

  it("mit Reiter: nur eigene Trainings, Ausfall markiert, Grund nirgends", async () => {
    const { holeOeffentlicheTrainings, holeVereineMitOeffentlichemTraining } = await import("./training-oeffentlich-daten");
    await testDb.update(schema.vereine).set({ trainingOeffentlich: true }).where(eq(schema.vereine.id, vereinId));
    const l = (await holeOeffentlicheTrainings(vereinId))!;
    expect(l.length).toBeGreaterThanOrEqual(2); // dieser Tag und der gleiche Wochentag eine Woche später
    expect(l.every((t) => t.mannschaft === "1. Herren (Mä)" && t.ort === "Sporthalle")).toBe(true);
    expect(l.find((t) => t.datum === datum)?.ausgefallen).toBe(true);
    expect(l.filter((t) => t.datum !== datum).every((t) => !t.ausgefallen)).toBe(true);
    expect(JSON.stringify(l)).not.toMatch(/krank|Fremd/);
    expect((await holeVereineMitOeffentlichemTraining()).has(vereinId)).toBe(true);
  });
});
