// Integrationstest der Treuhand-Übergabe gegen ein ECHTES Postgres
// (übersprungen ohne TEST_DATABASE_ADMIN_URL, siehe nuliga/sync.test.ts).
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
// Anonymer Besucher: keine Session
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(f: T) => f }));

describe.skipIf(!ADMIN_URL)("Treuhand (Postgres)", () => {
  const sysAdminId = randomUUID();
  const normalId = randomUUID();
  const sysEmail = `sys-${sysAdminId}@example.invalid`;
  const adminEmail = `neu-${sysAdminId}@example.invalid`;
  const angelegt: string[] = [];

  beforeAll(async () => {
    await testDb.insert(schema.users).values([
      { id: sysAdminId, email: sysEmail, name: "System", istSystemAdmin: true },
      { id: normalId, email: `normal-${normalId}@example.invalid`, name: "Normal" },
    ]);
  });
  afterAll(async () => {
    for (const id of angelegt) await testDb.delete(schema.vereine).where(eq(schema.vereine.id, id));
    await testDb.delete(schema.users).where(eq(schema.users.id, sysAdminId));
    await testDb.delete(schema.users).where(eq(schema.users.id, normalId));
    await pool.end();
  });

  it("nur Systemadmins dürfen vorbereiten und wechseln", async () => {
    const t = await import("./treuhand");
    await expect(t.vereinVorbereiten(normalId, "Nicht erlaubt")).rejects.toThrow("Systemadmins");
  });

  it("Ablauf: vorbereiten, einrichten, übergeben, Zugriff endet, Support nur mit Freigabe", async () => {
    const t = await import("./treuhand");
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Testverein Treuhand");
    angelegt.push(vereinId);

    // Vorbereitung: Status, Kontext nach Wechsel
    const [v1] = await testDb.select().from(schema.vereine).where(eq(schema.vereine.id, vereinId));
    expect(v1.status).toBe("vorbereitung");
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();
    await t.starteTreuhand(sysAdminId, vereinId, "einrichtung");
    expect(await t.holeTreuhandKontext(sysAdminId)).toMatchObject({ vereinId, art: "einrichtung" });

    // Mail-Sperre: Person im Verein bekommt in der Vorbereitung keine Mails
    const gastEmail = `gast-${vereinId}@example.invalid`;
    await testDb.insert(schema.users).values({ email: gastEmail, vereinId });
    expect(await t.istEmpfaengerGesperrt(gastEmail)).toBe(true);
    expect(await t.istEmpfaengerGesperrt(sysEmail)).toBe(false);

    // Übergabe mit schon vergebener E-Mail scheitert, ohne etwas zu ändern
    await expect(t.uebergebeVerein(sysAdminId, vereinId, "Admin", sysEmail)).rejects.toThrow("bereits vergeben");
    expect((await testDb.select().from(schema.vereine).where(eq(schema.vereine.id, vereinId)))[0].status).toBe(
      "vorbereitung"
    );

    // Übergabe
    const r = await t.uebergebeVerein(sysAdminId, vereinId, "Vereins Admin", adminEmail.toUpperCase());
    expect(r).toEqual({ vereinName: "Testverein Treuhand", adminEmail });
    const [v2] = await testDb.select().from(schema.vereine).where(eq(schema.vereine.id, vereinId));
    expect([v2.status, !!v2.uebergebenAm]).toEqual(["aktiv", true]);
    const [admin] = await testDb.select().from(schema.users).where(eq(schema.users.email, adminEmail));
    expect([admin.vereinId, admin.istAdmin]).toEqual([vereinId, true]);

    // Verbindung gekappt: Kontext weg, Einrichten nicht mehr möglich, Mails wieder erlaubt
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();
    await expect(t.starteTreuhand(sysAdminId, vereinId, "einrichtung")).rejects.toThrow("bereits übergeben");
    expect(await t.istEmpfaengerGesperrt(gastEmail)).toBe(false);

    // Support nur mit ausdrücklicher, befristeter Freigabe
    await expect(t.starteTreuhand(sysAdminId, vereinId, "support")).rejects.toThrow("Support-Freigabe");
    await t.setzeSupportFreigabe(vereinId, 1, "Vereins Admin");
    await t.starteTreuhand(sysAdminId, vereinId, "support");
    expect(await t.holeTreuhandKontext(sysAdminId)).toMatchObject({ vereinId, art: "support" });

    // Widerruf beendet auch den laufenden Zugriff sofort
    await t.setzeSupportFreigabe(vereinId, null, "Vereins Admin");
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();
    await expect(t.starteTreuhand(sysAdminId, vereinId, "support")).rejects.toThrow("Support-Freigabe");
    await expect(t.setzeSupportFreigabe(vereinId, 30, "x")).rejects.toThrow("Ungültige Dauer");

    // Abgelaufene Freigabe beendet einen Kontext beim nächsten Aufruf
    await t.setzeSupportFreigabe(vereinId, 1, "Vereins Admin");
    await t.starteTreuhand(sysAdminId, vereinId, "support");
    await testDb
      .update(schema.vereine)
      .set({ supportZugriffBis: new Date(Date.now() - 1000) })
      .where(eq(schema.vereine.id, vereinId));
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();

    // Protokoll hält alles fest
    const aktionen = (await t.holeProtokoll(vereinId, 50)).map((p) => p.aktion);
    for (const erwartet of [
      "vorbereitet",
      "einrichtung_gestartet",
      "uebergeben",
      "support_freigegeben",
      "support_zugriff",
      "support_widerrufen",
    ]) {
      expect(aktionen).toContain(erwartet);
    }

    // "Zurück ins System"
    await t.setzeSupportFreigabe(vereinId, 1, "Vereins Admin");
    await t.starteTreuhand(sysAdminId, vereinId, "support");
    await t.beendeTreuhand(sysAdminId);
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();
  });

  it("Vereine im Vorbereitungs-Modus sind öffentlich nicht auffindbar", async () => {
    const t = await import("./treuhand");
    const { holeAlleVereine, holeVerein } = await import("./liga-oeffentlich");
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Geheimer Verein");
    angelegt.push(vereinId);
    await testDb
      .insert(schema.ligaVereine)
      .values({ vereinId, slug: "geheimer-verein-test", name: "Geheimer Verein", nuligaClubId: "999999" });
    expect((await holeAlleVereine()).some((v) => v.slug === "geheimer-verein-test")).toBe(false);
    expect(await holeVerein("geheimer-verein-test")).toBeUndefined();

    // Nach der Übergabe erscheint er
    await t.uebergebeVerein(sysAdminId, vereinId, "Admin Zwei", `zwei-${vereinId}@example.invalid`);
    expect((await holeAlleVereine()).some((v) => v.slug === "geheimer-verein-test")).toBe(true);
    expect((await holeVerein("geheimer-verein-test"))?.id).toBeDefined();
  });

  it("Vereine im Vorbereitungs-Modus zählen nicht zum Beta-Limit, erst ab der Übergabe", async () => {
    const t = await import("./treuhand");
    const { zaehleVereineFuerBetaLimit } = await import("./system-einstellungen");
    const vorher = await zaehleVereineFuerBetaLimit();
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Limit-Testverein");
    angelegt.push(vereinId);
    expect(await zaehleVereineFuerBetaLimit()).toBe(vorher);
    await t.uebergebeVerein(sysAdminId, vereinId, "Admin Drei", `drei-${vereinId}@example.invalid`);
    expect(await zaehleVereineFuerBetaLimit()).toBe(vorher + 1);
  });
});
