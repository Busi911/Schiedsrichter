// Token (rein) und Schalter (gegen echtes Postgres, übersprungen ohne TEST_DATABASE_ADMIN_URL).
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
vi.stubEnv("AUTH_SECRET", "test-secret-fuer-abmelden");
vi.stubEnv("APP_URL", "https://example.test");

describe("Abmelde-Token", () => {
  it("Rundlauf: gültiger Token liefert Person und Art", async () => {
    const a = await import("./abmelden");
    const id = randomUUID();
    expect(a.pruefeAbmeldeToken(a.abmeldeToken(id, "digest"))).toEqual({ userId: id, art: "digest" });
    expect(a.abmeldeUrl(id, "termin")).toMatch(/^https:\/\/example\.test\/abmelden\/[\w-]+\.[\w-]+$/);
  });

  it("manipulierte, fremde oder kaputte Token werden abgelehnt", async () => {
    const a = await import("./abmelden");
    const id = randomUUID();
    const token = a.abmeldeToken(id, "digest");
    const [payload, sig] = token.split(".");
    // andere Person/Art mit der Signatur eines anderen Tokens
    const fremd = a.abmeldeToken(randomUUID(), "digest").split(".")[0];
    expect(a.pruefeAbmeldeToken(`${fremd}.${sig}`)).toBeNull();
    expect(a.pruefeAbmeldeToken(`${payload}.${sig.slice(0, -1)}x`)).toBeNull();
    expect(a.pruefeAbmeldeToken(payload)).toBeNull();
    expect(a.pruefeAbmeldeToken("")).toBeNull();
    expect(a.pruefeAbmeldeToken(`${token}.extra`)).toBeNull();
  });
});

describe.skipIf(!ADMIN_URL)("Abmelden (Postgres)", () => {
  const userId = randomUUID();
  const andereId = randomUUID();
  beforeAll(async () => {
    await testDb.insert(schema.users).values([
      { id: userId, email: `abm-${userId}@example.invalid`, name: "Abmelder" },
      { id: andereId, email: `abm-${andereId}@example.invalid`, name: "Andere" },
    ]);
  });
  afterAll(async () => {
    await testDb.delete(schema.users).where(eq(schema.users.id, userId));
    await testDb.delete(schema.users).where(eq(schema.users.id, andereId));
    await pool.end();
  });

  it("schaltet genau die gewählte Mailart für genau diese Person aus und wieder an", async () => {
    const a = await import("./abmelden");
    for (const art of Object.keys(a.ABMELDE_ARTEN) as (keyof typeof a.ABMELDE_ARTEN)[]) {
      expect(await a.istAngemeldet(userId, art)).toBe(true);
    }
    await a.setzeAbmeldung(userId, "digest", false);
    expect(await a.istAngemeldet(userId, "digest")).toBe(false);
    // andere Arten und andere Personen bleiben unberührt
    expect(await a.istAngemeldet(userId, "termin")).toBe(true);
    expect(await a.istAngemeldet(andereId, "digest")).toBe(true);
    await a.setzeAbmeldung(userId, "digest", true);
    expect(await a.istAngemeldet(userId, "digest")).toBe(true);
    // jede Art wirkt auf ihr eigenes Feld
    for (const art of ["termin", "sr-erinnerung", "zn-erinnerung", "broadcast"] as const) {
      await a.setzeAbmeldung(userId, art, false);
      expect(await a.istAngemeldet(userId, art)).toBe(false);
      await a.setzeAbmeldung(userId, art, true);
    }
  });
});
