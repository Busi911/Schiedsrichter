// Integrationstest: Mitglied <-> Mannschaft (übersprungen ohne TEST_DATABASE_ADMIN_URL).
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
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

type Daten = typeof import("./mitglied-mannschaften-daten");
let d: Daten;

describe.skipIf(!ADMIN_URL)("Mitglied <-> Mannschaft (Postgres)", () => {
  const vereinA = randomUUID();
  const vereinB = randomUUID();
  let mannschaftA: string;
  let mannschaftB: string;
  let mitgliedA: string;
  let mitgliedB: string;

  beforeAll(async () => {
    d = await import("./mitglied-mannschaften-daten");
    await testDb.insert(schema.vereine).values([{ id: vereinA, name: "TSV A" }, { id: vereinB, name: "TSV B" }]);
    const mk = async (vereinId: string, name: string) => {
      const [lv] = await testDb.insert(schema.ligaVereine).values({ vereinId, slug: `mm-${randomUUID().slice(0, 8)}`, name }).returning({ id: schema.ligaVereine.id });
      const [lm] = await testDb
        .insert(schema.ligaMannschaften)
        .values({ ligaVereinId: lv.id, slug: "m1", schluessel: "herren::1", name: `${name} Männer`, kategorie: "herren" })
        .returning({ id: schema.ligaMannschaften.id });
      return lm.id;
    };
    mannschaftA = await mk(vereinA, "TSV A");
    mannschaftB = await mk(vereinB, "TSV B");
    [{ id: mitgliedA }] = await testDb.insert(schema.mitglieder).values({ vereinId: vereinA, name: "Muster", vorname: "Max" }).returning({ id: schema.mitglieder.id });
    [{ id: mitgliedB }] = await testDb.insert(schema.mitglieder).values({ vereinId: vereinB, name: "Fremd", vorname: "Fritz" }).returning({ id: schema.mitglieder.id });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinA));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinB));
    await pool.end();
    await appPool.end();
  });

  it("listet nur die Mannschaften des eigenen Vereins", async () => {
    expect((await d.ladeVereinsMannschaften(vereinA)).map((m) => m.id)).toEqual([mannschaftA]);
  });

  it("ordnet zu, ignoriert Doppelte, speichert die Rolle", async () => {
    expect(await d.ordneZu(vereinA, { mitgliedId: mitgliedA, mannschaftId: mannschaftA, saison: "2026/27", rolle: "spieler" })).toEqual({ ok: true });
    expect(await d.ordneZu(vereinA, { mitgliedId: mitgliedA, mannschaftId: mannschaftA, saison: "2026/27", rolle: "trainer" })).toEqual({ ok: true });
    const z = await d.ladeZuordnungen(vereinA);
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ mitgliedId: mitgliedA, mannschaftId: mannschaftA, saison: "2026/27", rolle: "spieler" });
  });

  it("lehnt fremde Mannschaft, fremdes Mitglied und ungültige Eingaben ab", async () => {
    expect(await d.ordneZu(vereinA, { mitgliedId: mitgliedA, mannschaftId: mannschaftB, saison: "2026/27", rolle: "spieler" })).toHaveProperty("fehler");
    expect(await d.ordneZu(vereinA, { mitgliedId: mitgliedB, mannschaftId: mannschaftA, saison: "2026/27", rolle: "spieler" })).toHaveProperty("fehler");
    expect(await d.ordneZu(vereinA, { mitgliedId: mitgliedA, mannschaftId: mannschaftA, saison: "kaputt", rolle: "spieler" })).toHaveProperty("fehler");
    expect(await testDb.select().from(schema.mitgliedMannschaften).where(eq(schema.mitgliedMannschaften.mitgliedId, mitgliedB))).toHaveLength(0);
  });

  it("Verein B sieht und löscht die Zuordnung von Verein A nicht", async () => {
    const zA = (await d.ladeZuordnungen(vereinA))[0];
    expect(await d.ladeZuordnungen(vereinB)).toHaveLength(0);
    await d.entferneZuordnung(vereinB, zA.id);
    expect(await d.ladeZuordnungen(vereinA)).toHaveLength(1);
  });

  it("entfernt die eigene Zuordnung", async () => {
    const zA = (await d.ladeZuordnungen(vereinA))[0];
    await d.entferneZuordnung(vereinA, zA.id);
    expect(await d.ladeZuordnungen(vereinA)).toHaveLength(0);
  });
});
