// Integrationstest des Vereinsindex gegen ein ECHTES Postgres (übersprungen ohne TEST_DATABASE_ADMIN_URL).
// Die Fixtures sind nach Beschreibung nachgebaut (kein Zugriff auf die echte Seite).
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { aktualisiereVereinsindex, sucheVereinsindex } from "./vereinsindex";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const seite = readFileSync(path.join(import.meta.dirname, "__fixtures__", "vereinsuche-bezirk.html"), "utf8");

describe.skipIf(!ADMIN_URL)("Vereinsindex (Postgres)", () => {
  const aufrufe: string[] = [];
  const holeHtml = async (url: string) => {
    aufrufe.push(url);
    return seite;
  };
  beforeAll(async () => {
    await testDb.delete(schema.nuligaVereinsindex).where(eq(schema.nuligaVereinsindex.verband, "HHV"));
  });
  afterAll(async () => {
    await testDb.delete(schema.nuligaVereinsindex).where(eq(schema.nuligaVereinsindex.verband, "HHV"));
    await pool.end();
  });

  it("lädt Startseite + je Bezirk eine Seite und findet Vereine per Teilname und Nummer", async () => {
    const r = await aktualisiereVereinsindex({ db: testDb, holeHtml });
    expect(r.regionen).toBe(2);
    expect(r.vollstaendig).toBe(true);
    expect(aufrufe).toHaveLength(3);

    const linden = await sucheVereinsindex(testDb, "linden");
    expect(linden).toHaveLength(1);
    expect(linden[0]).toMatchObject({ name: "HSG Linden", clubId: "76446", nummer: "14194" });
    expect((await sucheVereinsindex(testDb, "14194"))[0]?.clubId).toBe("76446");
    expect(await sucheVereinsindex(testDb, "x")).toEqual([]);
    expect(await sucheVereinsindex(testDb, "%")).toEqual([]);
  });

  it("ist idempotent und entfernt nach vollständigem Lauf nur Veraltetes", async () => {
    await testDb.insert(schema.nuligaVereinsindex).values({ clubId: "99999", name: "Alt e.V.", aktualisiertAm: new Date("2020-01-01") });
    await aktualisiereVereinsindex({ db: testDb, holeHtml });
    const alle = await testDb.select().from(schema.nuligaVereinsindex);
    expect(alle.filter((v) => v.clubId === "76446")).toHaveLength(1);
    expect(alle.find((v) => v.clubId === "99999")).toBeUndefined();
  });

  it("löscht bei einem Teillauf (Frist) nichts", async () => {
    await testDb.insert(schema.nuligaVereinsindex).values({ clubId: "88888", name: "Bleibt e.V.", aktualisiertAm: new Date("2020-01-01") });
    const r = await aktualisiereVereinsindex({ db: testDb, holeHtml, frist: Date.now() - 1 });
    expect(r.vollstaendig).toBe(false);
    expect((await testDb.select().from(schema.nuligaVereinsindex)).some((v) => v.clubId === "88888")).toBe(true);
  });
});
