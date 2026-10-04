import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import { mitColdStartSchutz } from "./schutz";

const kaltStart = () => new Error("Connection terminated unexpectedly");
const nichtErreichbar = () => Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

// Ein Builder wie bei drizzle: Methoden geben this zurück, execute() führt aus.
function fakeBuilder(ausfuehrungen: Array<() => unknown>) {
  const b = {
    from: () => b,
    where: () => b,
    values: () => b,
    execute: vi.fn(async () => {
      const f = ausfuehrungen.shift();
      if (!f) throw new Error("zu oft ausgeführt");
      return f();
    }),
    // wie QueryPromise: then führt aus
    then: undefined as unknown,
  };
  return b;
}

describe("mitColdStartSchutz (ohne Datenbank)", () => {
  it("wiederholt eine lesende Abfrage nach einem Verbindungsfehler", async () => {
    const b = fakeBuilder([
      () => {
        throw kaltStart();
      },
      () => ["ok"],
    ]);
    const db = mitColdStartSchutz({ select: () => b });
    await expect(db.select().from().where()).resolves.toEqual(["ok"]);
    expect(b.execute).toHaveBeenCalledTimes(2);
  });

  it("wiederholt einen Schreibzugriff nur, wenn er sicher noch nicht lief", async () => {
    const unsicher = fakeBuilder([
      () => {
        throw kaltStart(); // "terminated" kann mitten in der Anweisung passieren
      },
      () => ["doppelt"],
    ]);
    const db1 = mitColdStartSchutz({ insert: () => unsicher });
    await expect(db1.insert().values()).rejects.toThrow(/terminated/);
    expect(unsicher.execute).toHaveBeenCalledTimes(1);

    const sicher = fakeBuilder([
      () => {
        throw nichtErreichbar();
      },
      () => ["ok"],
    ]);
    const db2 = mitColdStartSchutz({ insert: () => sicher });
    await expect(db2.insert().values()).resolves.toEqual(["ok"]);
    expect(sicher.execute).toHaveBeenCalledTimes(2);
  });

  it("wiederholt relationale Abfragen (query.<tabelle>.findMany) und execute", async () => {
    const b = fakeBuilder([
      () => {
        throw kaltStart();
      },
      () => [{ id: 1 }],
    ]);
    const exec = vi.fn().mockRejectedValueOnce(kaltStart()).mockResolvedValueOnce("ok");
    const db = mitColdStartSchutz({ query: { vereine: { findMany: () => b } }, execute: exec });
    await expect(db.query.vereine.findMany()).resolves.toEqual([{ id: 1 }]);
    await expect(db.execute()).resolves.toBe("ok");
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("wiederholt transaction() nur bei sicheren Verbindungsfehlern, andere Fehler gehen durch", async () => {
    const tx = vi.fn().mockRejectedValueOnce(nichtErreichbar()).mockResolvedValueOnce("fertig");
    const db = mitColdStartSchutz({ transaction: tx });
    await expect(db.transaction()).resolves.toBe("fertig");
    expect(tx).toHaveBeenCalledTimes(2);

    const fehler = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    await expect(mitColdStartSchutz({ transaction: fehler }).transaction()).rejects.toThrow(/duplicate/);
    expect(fehler).toHaveBeenCalledTimes(1);
  });

  it("reicht Eigenschaften und Funktionen sonst unverändert durch", () => {
    const db = mitColdStartSchutz({ x: 1, f: function (this: { x: number }) { return this.x; } });
    expect(db.x).toBe(1);
    expect(db.f()).toBe(1);
  });
});

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

describe.skipIf(!ADMIN_URL)("mitColdStartSchutz mit echtem drizzle + Postgres", () => {
  const pool = new Pool({ connectionString: ADMIN_URL });
  const echtQuery = pool.query.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  // Die ersten n Anweisungen scheitern wie bei einem schlafenden Compute.
  let ausfaelle = 0;
  (pool as unknown as { query: unknown }).query = (...a: unknown[]) => {
    if (ausfaelle > 0) {
      ausfaelle--;
      return Promise.reject(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    }
    return echtQuery(...a);
  };
  const db = mitColdStartSchutz(drizzle(pool, { schema }));
  const email = `schutz-${randomUUID()}@example.org`;

  afterAll(async () => {
    await echtQuery("delete from warteliste where admin_email = $1", [email]);
    await pool.end();
  });

  it("überlebt einen Ausfall beim Einfügen, Lesen (select und relational) und Löschen", async () => {
    ausfaelle = 1;
    await db.insert(schema.warteliste).values({ vereinsname: "Schutz", adminName: "T", adminEmail: email });
    ausfaelle = 1;
    const zeilen = await db.select().from(schema.warteliste).where(eq(schema.warteliste.adminEmail, email));
    expect(zeilen).toHaveLength(1);
    ausfaelle = 1;
    const rel = await db.query.warteliste.findFirst({ where: eq(schema.warteliste.adminEmail, email) });
    expect(rel?.vereinsname).toBe("Schutz");
    ausfaelle = 1;
    await db.delete(schema.warteliste).where(eq(schema.warteliste.adminEmail, email));
    expect(await db.select().from(schema.warteliste).where(eq(schema.warteliste.adminEmail, email))).toHaveLength(0);
  });
});
