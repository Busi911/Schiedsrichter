// Integrationstest: Arten der Mitgliedschaft (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
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
vi.mock("server-only", () => ({}));

type Daten = typeof import("./mitglieder-daten");
let d: Daten;

describe.skipIf(!ADMIN_URL)("Arten der Mitgliedschaft (Postgres)", () => {
  const vereinA = randomUUID();
  const vereinB = randomUUID();
  let artA: string;
  let artB: string;

  beforeAll(async () => {
    d = await import("./mitglieder-daten");
    await testDb.insert(schema.vereine).values([{ id: vereinA, name: "TSV A" }, { id: vereinB, name: "TSV B" }]);
    [{ id: artA }] = await testDb.insert(schema.mitgliedsarten).values({ vereinId: vereinA, name: "Fördermitglied" }).returning({ id: schema.mitgliedsarten.id });
    [{ id: artB }] = await testDb.insert(schema.mitgliedsarten).values({ vereinId: vereinB, name: "Fördermitglied" }).returning({ id: schema.mitgliedsarten.id });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinA));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinB));
    await pool.end();
    await appPool.end();
  });

  it("gleicher Name in zwei Vereinen ist erlaubt, im selben Verein nicht (ohne Beachtung der Schreibweise)", async () => {
    await expect(testDb.insert(schema.mitgliedsarten).values({ vereinId: vereinA, name: "FÖRDERMITGLIED" })).rejects.toThrow();
  });

  it("lädt nur die Arten des eigenen Vereins", async () => {
    expect((await d.ladeMitgliedsarten(vereinA)).map((a) => a.id)).toEqual([artA]);
  });

  it("pruefeArtId: leer = keine Angabe, eigene Art ok, fremde Art und Unsinn abgelehnt", async () => {
    expect(await d.pruefeArtId(vereinA, "")).toEqual({ artId: null });
    expect(await d.pruefeArtId(vereinA, artA)).toEqual({ artId: artA });
    expect(await d.pruefeArtId(vereinA, artB)).toHaveProperty("fehler");
    expect(await d.pruefeArtId(vereinA, "kein-uuid")).toHaveProperty("fehler");
  });

  it("Art löschen lässt das Mitglied bestehen (Art leer)", async () => {
    const [m] = await testDb.insert(schema.mitglieder).values({ vereinId: vereinA, name: "Muster", vorname: "Max", artId: artA }).returning({ id: schema.mitglieder.id });
    await testDb.delete(schema.mitgliedsarten).where(eq(schema.mitgliedsarten.id, artA));
    const danach = await testDb.query.mitglieder.findFirst({ where: eq(schema.mitglieder.id, m.id) });
    expect(danach).toMatchObject({ name: "Muster", artId: null });
  });

  it("Import-Plan: legt Mitglieder und fehlende Arten an (Schreibweise egal), nur im eigenen Verein", async () => {
    const { planeImport } = await import("./mitglieder-import");
    const arten = await d.ladeMitgliedsarten(vereinB);
    const plan = planeImport(
      [
        { zeilenNr: 2, felder: { vorname: "Anna", name: "Meier", art: "fördermitglied" } },
        { zeilenNr: 3, felder: { vorname: "Tim", name: "Roth", art: "Gönner", eintritt: "01.07.2020" } },
        { zeilenNr: 4, felder: { vorname: "Uwe", name: "Lang", art: "GÖNNER" } },
      ],
      { vorhandene: [], arten, heute: "2026-10-18" }
    );
    await d.schreibeImportPlan(vereinB, plan);
    const liste = await testDb.query.mitglieder.findMany({ where: eq(schema.mitglieder.vereinId, vereinB) });
    expect(liste.map((m) => m.name).sort()).toEqual(["Lang", "Meier", "Roth"]);
    const artenB = await d.ladeMitgliedsarten(vereinB);
    expect(artenB.map((a) => a.name).sort()).toEqual(["Fördermitglied", "Gönner"]);
    expect(liste.find((m) => m.name === "Meier")?.artId).toBe(artB);
    expect(liste.find((m) => m.name === "Lang")?.artId).toBe(liste.find((m) => m.name === "Roth")?.artId);
    expect(liste.find((m) => m.name === "Roth")?.eintrittsdatum).toBe("2020-07-01");
    expect(await testDb.query.mitglieder.findMany({ where: eq(schema.mitglieder.vereinId, vereinA) })).toHaveLength(1);
  });
});
