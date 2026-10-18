// Integrationstest: Funktionsträger -> Mitglieder (übersprungen ohne TEST_DATABASE_ADMIN_URL).
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
let fuehreUeberfuehrungAus: Daten["fuehreUeberfuehrungAus"];
let gleicheFunktionstraegerAb: Daten["gleicheFunktionstraegerAb"];
let ladeUeberfuehrungsPlan: Daten["ladeUeberfuehrungsPlan"];
let ergaenzeFunktionstraegerName: Daten["ergaenzeFunktionstraegerName"];

describe.skipIf(!ADMIN_URL)("Funktionsträger -> Mitglieder (Postgres)", () => {
  const vereinId = randomUUID();
  const fremdId = randomUUID();
  const u = (n: string) => `u-${n}-${vereinId.slice(0, 8)}`;

  async function person(id: string, name: string | null, email: string, rolleAktiv = true, verein = vereinId) {
    await testDb.insert(schema.users).values({ id, name, email, vereinId: verein });
    await testDb.insert(schema.funktionstraegerRollen).values({ userId: id, typ: "schiedsrichter", aktiv: rolleAktiv });
  }
  const alle = (verein = vereinId) => testDb.select().from(schema.mitglieder).where(eq(schema.mitglieder.vereinId, verein));

  beforeAll(async () => {
    ({ fuehreUeberfuehrungAus, gleicheFunktionstraegerAb, ladeUeberfuehrungsPlan, ergaenzeFunktionstraegerName } = await import("./mitglieder-daten"));
    await testDb.insert(schema.vereine).values([{ id: vereinId, name: "TSV Mitglieder" }, { id: fremdId, name: "TSV Fremd" }]);
    await person(u("a"), "Neu Person", `neu-${vereinId}@x.test`);
    await person(u("b"), "Max Müller", `max-${vereinId}@x.test`);
    await person(u("c"), "Passiv Person", `passiv-${vereinId}@x.test`, false);
    await person(u("d"), "Einname", `ein-${vereinId}@x.test`);
    await person(u("f"), "Fremde Person", `fremd-${vereinId}@x.test`, true, fremdId);
    // Admin ohne Rolle ist kein Funktionsträger
    await testDb.insert(schema.users).values({ id: u("g"), name: "Nur Admin", email: `admin-${vereinId}@x.test`, vereinId, istAdmin: true });
    await testDb.insert(schema.mitglieder).values({ vereinId, name: "Müller", vorname: "Max", email: `max-${vereinId}@x.test` });
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, vereinId));
    await testDb.delete(schema.vereine).where(eq(schema.vereine.id, fremdId));
    await testDb.delete(schema.users).where(eq(schema.users.vereinId, vereinId));
    await pool.end();
    await appPool.end();
  });

  it("Plan ist rein lesend", async () => {
    const plan = await ladeUeberfuehrungsPlan(vereinId);
    expect(plan.neu.map((n) => n.name).sort()).toEqual(["Person", "Person"]);
    expect(plan.verknuepfen).toHaveLength(1);
    expect(plan.unvollstaendig).toHaveLength(1);
    expect(await alle()).toHaveLength(1);
  });

  it("legt fehlende an, verknüpft Treffer, keine Doppelanlage, nur eigener Verein", async () => {
    const e = await fuehreUeberfuehrungAus(vereinId);
    expect(e).toMatchObject({ angelegt: 2, verknuepft: 1, unvollstaendig: 1 });
    const liste = await alle();
    expect(liste).toHaveLength(3);
    const max = liste.find((m) => m.name === "Müller")!;
    expect(max.userId).toBe(u("b"));
    expect(liste.find((m) => m.userId === u("a"))).toMatchObject({ vorname: "Neu", name: "Person", status: "aktiv", eintrittsdatum: null });
    // Auch ohne aktive Rolle: Status aktiv (kein passives Mitglied).
    expect(liste.find((m) => m.userId === u("c"))?.status).toBe("aktiv");
    expect(liste.some((m) => m.userId === u("g") || m.userId === u("f"))).toBe(false);
    expect(await alle(fremdId)).toHaveLength(0);
  });

  it("zweiter Lauf ändert nichts (idempotent)", async () => {
    const e = await fuehreUeberfuehrungAus(vereinId);
    expect(e).toMatchObject({ angelegt: 0, verknuepft: 0 });
    expect(await alle()).toHaveLength(3);
  });

  it("gleicheFunktionstraegerAb: ohne Add-on nichts, mit Add-on neue Person übernommen", async () => {
    await person(u("h"), "Spät Dazu", `spaet-${vereinId}@x.test`);
    await gleicheFunktionstraegerAb(vereinId);
    expect(await alle()).toHaveLength(3);
    await testDb.update(schema.vereine).set({ vereinsverwaltungAktiv: true }).where(eq(schema.vereine.id, vereinId));
    await gleicheFunktionstraegerAb(vereinId);
    const liste = await alle();
    expect(liste).toHaveLength(4);
    expect(liste.find((m) => m.userId === u("h"))).toBeTruthy();
  });

  it("Namensgleiche mit anderer Adresse werden nicht angelegt, sondern gemeldet", async () => {
    await person(u("i"), "Max Müller", `max-zweit-${vereinId}@x.test`);
    const e = await fuehreUeberfuehrungAus(vereinId);
    expect(e).toMatchObject({ angelegt: 0, pruefen: 1 });
    expect(await alle()).toHaveLength(4);
  });

  it("Nachname ergänzen: Einwort-Name wird vervollständigt und sofort als Mitglied übernommen; fremde Personen nicht", async () => {
    const vorher = (await alle()).length;
    expect(await ergaenzeFunktionstraegerName(vereinId, u("d"), "", "Namenlos")).toEqual({ ok: true });
    const konto = await testDb.query.users.findFirst({ where: eq(schema.users.id, u("d")) });
    expect(konto?.name).toBe("Einname Namenlos");
    const liste = await alle();
    expect(liste).toHaveLength(vorher + 1);
    expect(liste.find((m) => m.userId === u("d"))).toMatchObject({ vorname: "Einname", name: "Namenlos" });
    expect(await ergaenzeFunktionstraegerName(vereinId, u("f"), "", "Fremd")).toHaveProperty("fehler");
    expect(await ergaenzeFunktionstraegerName(vereinId, u("g"), "Nur", "Admin")).toHaveProperty("fehler");
    expect(await ergaenzeFunktionstraegerName(vereinId, u("h"), "", "  ")).toHaveProperty("fehler");
    expect((await testDb.query.users.findFirst({ where: eq(schema.users.id, u("f")) }))?.name).toBe("Fremde Person");
  });
});
