// Integrationstest: Ausfall melden, frei gewordene Zeit belegen (wer zuerst bucht), aufheben (übersprungen ohne TEST_DATABASE_ADMIN_URL/TEST_DATABASE_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { addiereTage, berlinJetzt, wochentagVonDatum } from "@/lib/training-ausfall";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const APP_URL = process.env.TEST_DATABASE_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const appPool = new Pool({ connectionString: APP_URL ?? "postgres://unused" });
const appDb = drizzle(appPool, { schema });
const mails: { to: string; subject: string }[] = [];
const nachher: (() => Promise<unknown>)[] = [];
let aktuell: { user: { id: string; vereinId: string; istAdmin: boolean; istAdminLesend: boolean } };

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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => nachher.push(fn) }));
vi.mock("@/lib/session", () => ({ requireSession: async () => aktuell }));
vi.mock("@/lib/mailer", () => ({ sendMail: async (to: string, subject: string) => void mails.push({ to, subject }) }));
vi.stubEnv("AUTH_SECRET", "test-secret");
vi.stubEnv("APP_URL", "https://example.test");

const form = (felder: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(felder)) f.set(k, v);
  return f;
};

describe.skipIf(!ADMIN_URL || !APP_URL)("Training: Ausfall und Belegung (Postgres)", () => {
  const vereinId = randomUUID();
  const trainerA = randomUUID(); // trainiert Mannschaft A (fällt aus)
  const trainerB = randomUUID(); // trainiert Mannschaft B (bucht)
  const trainerC = randomUUID();
  const adminId = randomUUID();
  let mA: string, mB: string, mC: string, zeitA: string;
  let datum: string;

  async function actions() {
    return import("./actions");
  }
  async function laufen(fn: () => Promise<unknown>) {
    mails.length = 0;
    nachher.length = 0;
    await fn();
    for (const n of nachher) await n();
  }
  const als = (id: string, istAdmin = false) => {
    aktuell = { user: { id, vereinId, istAdmin, istAdminLesend: false } };
  };

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSV Belegung" });
    await testDb.insert(schema.users).values([
      { id: trainerA, email: `a-${trainerA}@x.test`, vereinId },
      { id: trainerB, email: `b-${trainerB}@x.test`, vereinId },
      { id: trainerC, email: `c-${trainerC}@x.test`, vereinId },
      { id: adminId, email: `admin-${adminId}@x.test`, vereinId, istAdmin: true },
    ]);
    const m = await testDb
      .insert(schema.mannschaften)
      .values([
        { vereinId, name: "Herren" },
        { vereinId, name: "Damen" },
        { vereinId, name: "Jugend" },
      ])
      .returning({ id: schema.mannschaften.id });
    [mA, mB, mC] = m.map((x) => x.id);
    await testDb.insert(schema.funktionstraegerRollen).values([
      { userId: trainerA, typ: "trainer", mannschaftId: mA },
      { userId: trainerB, typ: "trainer", mannschaftId: mB },
      { userId: trainerC, typ: "trainer", mannschaftId: mC },
    ]);
    const [halle] = await testDb.insert(schema.hallen).values({ vereinId, name: "Sporthalle" }).returning({ id: schema.hallen.id });
    // Trainingstag: der übernächste Kalendertag (liegt sicher in der Zukunft), Training von A um 18:00-19:30
    datum = addiereTage(berlinJetzt(new Date()).datum, 2);
    const [z] = await testDb
      .insert(schema.trainingszeiten)
      .values({ vereinId, mannschaftId: mA, halleId: halle.id, wochentag: wochentagVonDatum(datum), startMinuten: 1080, endMinuten: 1170 })
      .returning({ id: schema.trainingszeiten.id });
    zeitA = z.id;
  });

  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await pool.end();
    await appPool.end();
  });

  beforeEach(async () => {
    await testDb.delete(schema.trainingBelegungen).where(eq(schema.trainingBelegungen.vereinId, vereinId));
    await testDb.delete(schema.trainingAusfaelle).where(eq(schema.trainingAusfaelle.vereinId, vereinId));
  });

  const melden = async () => {
    const a = await actions();
    als(trainerA);
    await laufen(() => a.trainingAusfallMelden(form({ trainingszeitId: zeitA, datum, grund: "Halle gesperrt" })));
  };
  const belegungen = () => testDb.select().from(schema.trainingBelegungen).where(eq(schema.trainingBelegungen.vereinId, vereinId));

  it("Ausfall melden: nur Trainer der eigenen Mannschaft; Mail an die anderen Trainer, nicht an die meldende Person", async () => {
    const a = await actions();
    als(trainerB);
    await expect(a.trainingAusfallMelden(form({ trainingszeitId: zeitA, datum }))).rejects.toThrow(/Nur Admins und Trainer dieser Mannschaft/);
    await melden();
    expect(mails.map((m) => m.to).sort()).toEqual([`b-${trainerB}@x.test`, `c-${trainerC}@x.test`].sort());
  });

  it("belegen: ein Trainer bucht für seine Mannschaft; die ausfallende Mannschaft und Admins werden informiert", async () => {
    await melden();
    const a = await actions();
    als(trainerB);
    await laufen(() => a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mB, notiz: "Testspiel" })));
    const b = await belegungen();
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ mannschaftId: mB, notiz: "Testspiel", datum });
    expect(mails.map((m) => m.to).sort()).toEqual([`a-${trainerA}@x.test`, `admin-${adminId}@x.test`].sort());
    expect(mails[0].subject).toMatch(/Damen nutzt Sporthalle/);
  });

  it("wer zuerst bucht: die zweite Buchung scheitert, die erste bleibt", async () => {
    await melden();
    const a = await actions();
    als(trainerB);
    await laufen(() => a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mB })));
    als(trainerC);
    await expect(a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mC }))).rejects.toThrow(/gerade jemand anderes/);
    expect((await belegungen()).map((x) => x.mannschaftId)).toEqual([mB]);
  });

  it("falsche Buchungen werden abgelehnt: fremde Mannschaft, ausfallende Mannschaft selbst, ohne Ausfall", async () => {
    const a = await actions();
    als(trainerB);
    await expect(a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mB }))).rejects.toThrow(/kein Training ausgefallen/);
    await melden();
    als(trainerB);
    await expect(a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mC }))).rejects.toThrow(/nicht für diese Mannschaft/);
    als(trainerA);
    await expect(a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mA }))).rejects.toThrow(/nicht für diese Mannschaft/);
    expect(await belegungen()).toHaveLength(0);
  });

  it("ein Admin bucht für jede andere Mannschaft", async () => {
    await melden();
    const a = await actions();
    als(adminId, true);
    await laufen(() => a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mC })));
    expect((await belegungen()).map((x) => x.mannschaftId)).toEqual([mC]);
  });

  it("aufheben: nur die buchende Mannschaft oder ein Admin; danach erfahren es alle Trainer", async () => {
    await melden();
    const a = await actions();
    als(trainerB);
    await laufen(() => a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mB })));
    const [b] = await belegungen();
    als(trainerC);
    await expect(a.trainingBelegungAufheben(form({ belegungId: b.id }))).rejects.toThrow(/Nur Admins und Trainer der buchenden Mannschaft/);
    als(trainerB);
    await laufen(() => a.trainingBelegungAufheben(form({ belegungId: b.id })));
    expect(await belegungen()).toHaveLength(0);
    expect(mails.map((m) => m.to).sort()).toEqual([`a-${trainerA}@x.test`, `c-${trainerC}@x.test`].sort());
    expect(mails[0].subject).toMatch(/^Wieder frei/);
  });

  it("Ausfall zurücknehmen, solange die Zeit belegt ist: Trainer scheitert, Admin entscheidet und die Belegung entfällt", async () => {
    await melden();
    const a = await actions();
    als(trainerB);
    await laufen(() => a.trainingBelegen(form({ trainingszeitId: zeitA, datum, mannschaftId: mB })));
    als(trainerA);
    await expect(a.trainingAusfallZuruecknehmen(form({ trainingszeitId: zeitA, datum }))).rejects.toThrow(/schon von Damen belegt/);
    expect(await belegungen()).toHaveLength(1);

    als(adminId, true);
    await laufen(() => a.trainingAusfallZuruecknehmen(form({ trainingszeitId: zeitA, datum })));
    expect(await belegungen()).toHaveLength(0);
    const ausfaelle = await testDb.select().from(schema.trainingAusfaelle).where(and(eq(schema.trainingAusfaelle.vereinId, vereinId), eq(schema.trainingAusfaelle.datum, datum)));
    expect(ausfaelle).toHaveLength(0);
    expect(mails.some((m) => m.to === `b-${trainerB}@x.test` && /^Belegung entfällt/.test(m.subject))).toBe(true);
  });
});
