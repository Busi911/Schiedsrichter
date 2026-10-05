// Integrationstest gegen ein ECHTES Postgres (übersprungen ohne TEST_DATABASE_ADMIN_URL, siehe liga-oeffentlich.test.ts).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

describe.skipIf(!ADMIN_URL)("holeVereinsGesundheit (Postgres)", () => {
  const vereinId = randomUUID();
  const jetzt = new Date();

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "Testverein Gesundheit", avvAkzeptiertAm: jetzt });
    await testDb.insert(schema.users).values([
      { id: `${vereinId}-a`, email: `a-${vereinId}@test.de`, name: "Admin", vereinId, istAdmin: true, letzterLoginAm: jetzt, letzteAktivitaetAm: jetzt },
      { id: `${vereinId}-b`, email: `b-${vereinId}@test.de`, name: "Person", vereinId },
    ]);
    await testDb.insert(schema.funktionstraegerRollen).values({ userId: `${vereinId}-b`, typ: "zeitnehmer" });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await pool.end();
  });

  it("zählt Personen, Anmeldungen, Rollen, Online und Einrichtungspunkte", async () => {
    const { holeVereinsGesundheit } = await import("./verein-gesundheit");
    const { vereine, online } = await holeVereinsGesundheit(jetzt);
    const v = vereine.find((x) => x.id === vereinId)!;
    expect(v.kennzahlen).toMatchObject({
      personen: 2,
      admins: 1,
      mitRolle: 1,
      angemeldet: 1,
      adminAngemeldet: true,
      avvAkzeptiert: true,
      mannschaften: 0,
      onlineJetzt: 1,
    });
    expect(v.lebenszeichen).toBe("lebt");
    expect(v.punkte.filter((p) => p.erfuellt).map((p) => p.schluessel)).toEqual(["admin", "adminLogin", "avv", "funktionstraeger"]);
    expect(online.some((o) => o.vereinName === "Testverein Gesundheit" && o.istAdmin)).toBe(true);
  });
});
