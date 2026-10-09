// Abruf-Berechtigung gegen ein ECHTES Postgres (übersprungen ohne TEST_DATABASE_ADMIN_URL): nur aktive Vereine und Vereine in Vorbereitung
// mit gültigem (nicht widerrufenem, nicht abgelaufenem) Vorschau-Link dürfen externe Abrufe auslösen.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { inArray } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));

describe.skipIf(!ADMIN_URL)("Abruf-Berechtigung (Postgres)", () => {
  const ids = {
    aktiv: randomUUID(),
    vorbereitungOhneLink: randomUUID(),
    vorbereitungMitLink: randomUUID(),
    vorbereitungAbgelaufen: randomUUID(),
    vorbereitungWiderrufen: randomUUID(),
  };
  const jetzt = new Date("2026-10-10T12:00:00Z");
  const tage = (n: number) => new Date(jetzt.getTime() + n * 24 * 3600 * 1000);

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values([
      { id: ids.aktiv, name: "Aktiv", status: "aktiv" },
      { id: ids.vorbereitungOhneLink, name: "Vorb ohne", status: "vorbereitung" },
      { id: ids.vorbereitungMitLink, name: "Vorb mit", status: "vorbereitung" },
      { id: ids.vorbereitungAbgelaufen, name: "Vorb abgelaufen", status: "vorbereitung" },
      { id: ids.vorbereitungWiderrufen, name: "Vorb widerrufen", status: "vorbereitung" },
    ]);
    await testDb.insert(schema.vereinVorschauLinks).values([
      { vereinId: ids.vorbereitungMitLink, token: randomUUID(), gueltigBis: tage(3) },
      { vereinId: ids.vorbereitungAbgelaufen, token: randomUUID(), gueltigBis: tage(-1) },
      { vereinId: ids.vorbereitungWiderrufen, token: randomUUID(), gueltigBis: tage(3), widerrufenAm: tage(-1) },
    ]);
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(inArray(schema.vereine.id, Object.values(ids)));
    await pool.end();
  });

  it("aktiv und Vorbereitung mit gültigem Link ja; ohne Link, abgelaufen oder widerrufen nein", async () => {
    const { holeSyncBerechtigteVereinIds } = await import("./sync-berechtigung");
    const erlaubt = await holeSyncBerechtigteVereinIds(jetzt);
    expect(erlaubt.has(ids.aktiv)).toBe(true);
    expect(erlaubt.has(ids.vorbereitungMitLink)).toBe(true);
    expect(erlaubt.has(ids.vorbereitungOhneLink)).toBe(false);
    expect(erlaubt.has(ids.vorbereitungAbgelaufen)).toBe(false);
    expect(erlaubt.has(ids.vorbereitungWiderrufen)).toBe(false);
  });
});
