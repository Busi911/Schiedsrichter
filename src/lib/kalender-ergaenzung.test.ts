// Integrationstest: Trainings und Vereinstermine im Gesamtkalender (übersprungen ohne TEST_DATABASE_ADMIN_URL/TEST_DATABASE_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { parseKalenderArten } from "./kalender-arten";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const APP_URL = process.env.TEST_DATABASE_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const appPool = new Pool({ connectionString: APP_URL ?? "postgres://unused" });
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

// Donnerstag 22.10.2026 liegt im Oktober 2026
const VON = new Date("2026-09-30T22:00:00Z");
const BIS = new Date("2026-10-31T22:59:59Z");
const ALLE = parseKalenderArten(undefined);

describe.skipIf(!ADMIN_URL || !APP_URL)("Gesamtkalender: Ergänzung (Postgres)", () => {
  const vereinId = randomUUID();
  const trainerId = randomUUID();
  const eigenerTrainer = randomUUID();
  const sonstigePerson = randomUUID();
  const adminId = randomUUID();
  let mannschaftA: string;
  let mannschaftB: string;
  let zeitA: string;

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values({ id: vereinId, name: "TSV Kalender", vereinstermineAktiv: true });
    await testDb.insert(schema.users).values([
      { id: trainerId, email: `t-${trainerId}@x.test`, vereinId },
      { id: eigenerTrainer, email: `e-${eigenerTrainer}@x.test`, vereinId },
      { id: sonstigePerson, email: `s-${sonstigePerson}@x.test`, vereinId },
      { id: adminId, email: `a-${adminId}@x.test`, vereinId, istAdmin: true },
    ]);
    const [a, b] = await testDb
      .insert(schema.mannschaften)
      .values([
        { vereinId, name: "Herren", altersklasse: "Mä" },
        { vereinId, name: "Damen", altersklasse: "Fr" },
      ])
      .returning({ id: schema.mannschaften.id });
    mannschaftA = a.id;
    mannschaftB = b.id;
    await testDb.insert(schema.funktionstraegerRollen).values([
      { userId: trainerId, typ: "trainer", mannschaftId: mannschaftA },
      { userId: eigenerTrainer, typ: "trainer", mannschaftId: mannschaftB },
    ]);
    const [halle] = await testDb.insert(schema.hallen).values({ vereinId, name: "Sporthalle", abteilAnzahl: 2, abteil1Name: "Nord" }).returning({ id: schema.hallen.id });
    const zeiten = await testDb
      .insert(schema.trainingszeiten)
      .values([
        { vereinId, mannschaftId: mannschaftA, halleId: halle.id, wochentag: 3, startMinuten: 1080, endMinuten: 1170, abteilNummer: 1 },
        { vereinId, mannschaftId: mannschaftB, halleId: halle.id, wochentag: 1, startMinuten: 1020, endMinuten: 1110 },
      ])
      .returning({ id: schema.trainingszeiten.id, mannschaftId: schema.trainingszeiten.mannschaftId });
    zeitA = zeiten.find((z) => z.mannschaftId === mannschaftA)!.id;
    // Beachplatz mit Saison Mai bis September: im Oktober keine Trainings dort, im Juni schon
    const [platz] = await testDb
      .insert(schema.hallen)
      .values({ vereinId, name: "Beachplatz", art: "platz", saisonVonMonat: 5, saisonBisMonat: 9 })
      .returning({ id: schema.hallen.id });
    await testDb.insert(schema.trainingszeiten).values({ vereinId, mannschaftId: mannschaftA, halleId: platz.id, wochentag: 2, startMinuten: 1020, endMinuten: 1110 });
    await testDb.insert(schema.trainingAusfaelle).values({ vereinId, trainingszeitId: zeitA, datum: "2026-10-22", grund: "Halle gesperrt" });
    await testDb.insert(schema.vereinstermine).values([
      { vereinId, titel: "Vorstandssitzung", art: "sitzung", start: new Date("2026-10-27T17:00:00Z"), sichtbarkeit: "admins" },
      { vereinId, titel: "Arbeitseinsatz", art: "arbeitseinsatz", start: new Date("2026-10-24T08:00:00Z"), sichtbarkeit: "alle" },
    ]);
  });

  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await pool.end();
    await appPool.end();
  });

  async function hole(userId: string, ansicht: "admin" | "profil", opt: { istAdmin?: boolean; arten?: ReturnType<typeof parseKalenderArten> } = {}) {
    const { holeKalenderErgaenzung } = await import("./kalender-ergaenzung");
    return holeKalenderErgaenzung({ vereinId, userId, istAdmin: !!opt.istAdmin, istAdminLesend: false, von: VON, bis: BIS, arten: opt.arten ?? ALLE, ansicht });
  }
  const ids = (e: { eintraege: Map<string, { id: string; art?: string }[]> }, art: string) => [...e.eintraege.values()].flat().filter((x) => x.art === art);

  it("Admin-Kalender: alle Trainings des Monats, Ausfall markiert, beide Vereinstermine", async () => {
    const e = await hole(adminId, "admin", { istAdmin: true });
    const trainings = [...e.eintraege.values()].flat().filter((x) => x.art === "training");
    // Donnerstage (Herren): 1., 8., 15., 22., 29.; Dienstage (Damen): 6., 13., 20., 27.
    expect(trainings).toHaveLength(9);
    const ausfall = e.eintraege.get("2026-10-22")!.find((x) => x.art === "training")!;
    expect(ausfall).toMatchObject({ ausgefallen: true, label: "Herren (Mä)", ort: "Sporthalle, Nord", zeit: "18:00", detailText: "Grund: Halle gesperrt" });
    expect(ids(e, "vereinstermin")).toHaveLength(2);
    expect(e.verfuegbar).toEqual({ training: true, verein: true });
  });

  it("Mein Kalender: Trainer sieht nur Trainings der eigenen Mannschaft und nur Termine, die er sehen darf", async () => {
    const e = await hole(trainerId, "profil");
    const trainings = [...e.eintraege.values()].flat().filter((x) => x.art === "training");
    expect(trainings).toHaveLength(5);
    expect(trainings.every((t) => t.label === "Herren (Mä)")).toBe(true);
    expect(ids(e, "vereinstermin").map((x) => x.id)).toHaveLength(1); // "nur Admins" bleibt verborgen
  });

  it("Person ohne Rolle: keine Trainings (Option aus), aber der Termin für alle; Filter 'verfügbar' ohne Training", async () => {
    const e = await hole(sonstigePerson, "profil");
    expect(ids(e, "training")).toHaveLength(0);
    expect(ids(e, "vereinstermin")).toHaveLength(1);
    expect(e.verfuegbar).toEqual({ training: false, verein: true });
  });

  it("mit 'Training für alle' sieht jede Person alle Trainings", async () => {
    await testDb.update(schema.vereine).set({ trainingFuerAlleSichtbar: true }).where(eq(schema.vereine.id, vereinId));
    const e = await hole(sonstigePerson, "profil");
    expect(ids(e, "training")).toHaveLength(9);
    await testDb.update(schema.vereine).set({ trainingFuerAlleSichtbar: false }).where(eq(schema.vereine.id, vereinId));
  });

  it("Beachplatz mit Saison: im Oktober keine Einträge, im Juni (in der Saison) alle Mittwochs-Trainings, Ausfall sagt 'Platz frei'", async () => {
    const oktober = await hole(adminId, "admin", { istAdmin: true });
    expect([...oktober.eintraege.values()].flat().filter((x) => x.ort === "Beachplatz")).toHaveLength(0);

    const { holeKalenderErgaenzung } = await import("./kalender-ergaenzung");
    const juni = await holeKalenderErgaenzung({
      vereinId,
      userId: adminId,
      istAdmin: true,
      istAdminLesend: false,
      von: new Date("2026-05-31T22:00:00Z"),
      bis: new Date("2026-06-30T21:59:59Z"),
      arten: ALLE,
      ansicht: "admin",
    });
    const beach = [...juni.eintraege.values()].flat().filter((x) => x.ort === "Beachplatz");
    expect(beach).toHaveLength(4); // Mittwoche: 3., 10., 17., 24.6.
    expect(beach.every((b) => b.label === "Herren (Mä)")).toBe(true);
  });

  it("Filter: nur Vereinstermine liefert keine Trainings", async () => {
    const e = await hole(adminId, "admin", { istAdmin: true, arten: parseKalenderArten("verein") });
    expect(ids(e, "training")).toHaveLength(0);
    expect(ids(e, "vereinstermin")).toHaveLength(2);
  });

  it("Vereinstermine ausgeschaltet: keine Einträge, Filter nicht verfügbar", async () => {
    await testDb.update(schema.vereine).set({ vereinstermineAktiv: false }).where(eq(schema.vereine.id, vereinId));
    const e = await hole(adminId, "admin", { istAdmin: true });
    expect(ids(e, "vereinstermin")).toHaveLength(0);
    expect(e.verfuegbar.verein).toBe(false);
    await testDb.update(schema.vereine).set({ vereinstermineAktiv: true }).where(eq(schema.vereine.id, vereinId));
  });
});
