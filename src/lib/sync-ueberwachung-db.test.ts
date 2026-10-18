// Integrationstest: Überwachung der Abgleiche (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const appPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://unused" });
const appDb = drizzle(appPool, { schema });
const mailSpy = vi.fn();
vi.mock("@/db", () => ({
  db: appDb,
  withTenant: <T,>(vId: string, callback: (tx: typeof appDb) => Promise<T>) =>
    appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_verein_id', ${vId}, true)`);
      return callback(tx as unknown as typeof appDb);
    }),
}));
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("@/lib/mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));

type Modul = typeof import("./sync-ueberwachung-daten");
let m: Modul;

const JETZT = new Date("2026-10-18T12:00:00Z");
const vor = (h: number) => new Date(JETZT.getTime() - h * 3_600_000);

describe.skipIf(!ADMIN_URL)("Überwachung der Abgleiche (Postgres)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids = { kaputt: randomUUID(), gesund: randomUUID(), vorbereitung: randomUUID(), demo: randomUUID() };
  const ligaIds: Record<keyof typeof ids, string> = { kaputt: "", gesund: "", vorbereitung: "", demo: "" };
  const adminEmail = `sysadmin-${tag}@ueberwachung.test`;
  const meinLigaVerein = () => ligaIds.kaputt;

  async function loescheZustand() {
    await testDb.delete(schema.ligaQuellenAbrufe).where(and(eq(schema.ligaQuellenAbrufe.quelle, "ueberwachung"), eq(schema.ligaQuellenAbrufe.schluessel, "zustand")));
  }

  beforeAll(async () => {
    m = await import("./sync-ueberwachung-daten");
    await loescheZustand();
    await testDb.insert(schema.users).values({ id: `sys-${tag}`, email: adminEmail, istSystemAdmin: true });
    await testDb.insert(schema.vereine).values([
      { id: ids.kaputt, name: `TSV Kaputt ${tag}`, status: "aktiv" },
      { id: ids.gesund, name: `TSV Gesund ${tag}`, status: "aktiv" },
      { id: ids.vorbereitung, name: `TSV Vorbereitung ${tag}`, status: "vorbereitung" },
      { id: ids.demo, name: `TSV Demo ${tag}`, status: "aktiv", istDemo: true },
    ]);
    for (const k of Object.keys(ids) as (keyof typeof ids)[]) {
      const [lv] = await testDb
        .insert(schema.ligaVereine)
        .values({
          vereinId: ids[k],
          slug: `ue-${k}-${tag}`,
          name: k,
          nuligaClubId: `club-${k}-${tag}`,
          erstelltAm: vor(24 * 30),
          spieleSynchronisiertAm: k === "gesund" ? vor(2) : vor(30),
        })
        .returning({ id: schema.ligaVereine.id });
      ligaIds[k] = lv.id;
    }
  });
  afterAll(async () => {
    for (const id of Object.values(ids)) await testDb.delete(schema.vereine).where(eq(schema.vereine.id, id));
    await testDb.delete(schema.users).where(eq(schema.users.id, `sys-${tag}`));
    await loescheZustand();
    await pool.end();
    await appPool.end();
  });

  it("ladeSnapshot: nur aktive Vereine ohne Demo", async () => {
    const snap = await m.ladeSnapshot(JETZT);
    const meine = snap.vereine.filter((v) => Object.values(ligaIds).includes(v.id));
    expect(meine.map((v) => v.id).sort()).toEqual([ligaIds.kaputt, ligaIds.gesund].sort());
  });

  it("nurPruefen: Befund ohne Mail und ohne Zustand", async () => {
    mailSpy.mockClear();
    const lauf = await m.fuehreUeberwachungAus({ jetzt: JETZT, nurPruefen: true });
    const veraltet = lauf.befunde.find((b) => b.gruppe === "nuliga-veraltet");
    expect(veraltet?.betroffen).toContain(meinLigaVerein());
    expect(veraltet?.betroffen).not.toContain(ligaIds.gesund);
    expect(mailSpy).not.toHaveBeenCalled();
    expect(await testDb.query.ligaQuellenAbrufe.findFirst({ where: eq(schema.ligaQuellenAbrufe.quelle, "ueberwachung") })).toBeUndefined();
  });

  it("meldet einmal an die Systemadmins und bleibt danach stumm", async () => {
    mailSpy.mockClear();
    const erster = await m.fuehreUeberwachungAus({ jetzt: JETZT });
    expect(erster.gemeldet).toBeGreaterThan(0);
    const anMich = mailSpy.mock.calls.filter((c) => c[0] === adminEmail);
    expect(anMich).toHaveLength(1);
    expect(String(anMich[0][1])).toContain("Überwachung");
    expect(String(anMich[0][2])).toContain(`TSV Kaputt ${tag}`);

    mailSpy.mockClear();
    const zweiter = await m.fuehreUeberwachungAus({ jetzt: new Date(JETZT.getTime() + 3_600_000) });
    expect(zweiter.gemeldet).toBe(0);
    expect(mailSpy.mock.calls.filter((c) => c[0] === adminEmail)).toHaveLength(0);
  });

  it("nach der Behebung taucht der Verein nicht mehr auf", async () => {
    await testDb.update(schema.ligaVereine).set({ spieleSynchronisiertAm: new Date(JETZT.getTime() + 2 * 3_600_000) }).where(eq(schema.ligaVereine.id, ligaIds.kaputt));
    const lauf = await m.fuehreUeberwachungAus({ jetzt: new Date(JETZT.getTime() + 2 * 3_600_000) });
    expect(lauf.befunde.find((b) => b.gruppe === "nuliga-veraltet")?.betroffen ?? []).not.toContain(ligaIds.kaputt);
  });

  it("drei Fehler in Folge ergeben einen Befund", async () => {
    for (let i = 1; i <= 3; i++) {
      await testDb.insert(schema.ligaSyncLaeufe).values({ ligaVereinId: ligaIds.gesund, art: "spiele", status: "fehler", gestartetAm: new Date(JETZT.getTime() - i * 3_600_000) });
    }
    const lauf = await m.fuehreUeberwachungAus({ jetzt: JETZT, nurPruefen: true });
    expect(lauf.befunde.find((b) => b.gruppe === "nuliga-fehler")?.betroffen).toContain(ligaIds.gesund);
  });
});
