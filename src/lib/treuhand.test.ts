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
const sendMailMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./mailer", () => ({ sendMail: sendMailMock }));
let vorschauCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "hp_vorschau" && vorschauCookie ? { value: vorschauCookie } : undefined) }),
}));
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

    // Dauerhafte Freigabe (Wunsch des Vereinsadmins): gilt bis zum Widerruf und ist jederzeit widerrufbar
    const dauerhaft = await t.setzeSupportFreigabe(vereinId, "dauerhaft", "Vereins Admin");
    expect(t.istDauerhaft(dauerhaft)).toBe(true);
    await t.starteTreuhand(sysAdminId, vereinId, "support");
    expect(await t.holeTreuhandKontext(sysAdminId)).toMatchObject({ vereinId, art: "support" });
    await t.setzeSupportFreigabe(vereinId, null, "Vereins Admin");
    expect(await t.holeTreuhandKontext(sysAdminId)).toBeNull();
    await expect(t.starteTreuhand(sysAdminId, vereinId, "support")).rejects.toThrow("Support-Freigabe");

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

  it("eine Support-Freigabe benachrichtigt alle Systemadmins per Mail", async () => {
    const t = await import("./treuhand");
    const { benachrichtigeSystemAdminsUeberSupportFreigabe } = await import("./system-admin-benachrichtigung");
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Freigabe Verein");
    angelegt.push(vereinId);
    sendMailMock.mockClear();
    const bis = await t.setzeSupportFreigabe(vereinId, 3, "Vereins Admin");
    expect(bis).toBeInstanceOf(Date);
    await benachrichtigeSystemAdminsUeberSupportFreigabe(vereinId, bis!, "Vereins Admin");
    const an = sendMailMock.mock.calls.map((c) => c as unknown as [string, string]);
    const meine = an.find(([empfaenger]) => empfaenger === sysEmail);
    expect(meine?.[1]).toBe("Support-Freigabe: Freigabe Verein");
    // Widerruf liefert kein Datum (kein Anlass für eine Mail)
    expect(await t.setzeSupportFreigabe(vereinId, null, "Vereins Admin")).toBeNull();
  });

  it("Logo, Icon und Manifest eines Vorschau-Vereins werden nur mit gültigem Vorschau-Cookie ausgeliefert", async () => {
    const t = await import("./treuhand");
    const v = await import("./verein-vorschau");
    const logoRoute = await import("@/app/verein/[slug]/logo/route");
    const manifestRoute = await import("@/app/verein/[slug]/manifest.webmanifest/route");
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Logo Vorschau Verein");
    angelegt.push(vereinId);
    const [lv] = await testDb
      .insert(schema.ligaVereine)
      .values({ vereinId, slug: "logo-vorschau-test", name: "Logo Vorschau Verein", nuligaClubId: "999993" })
      .returning({ id: schema.ligaVereine.id });
    // winziges gültiges PNG (1x1)
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
      "base64"
    );
    await testDb.insert(schema.ligaVereinLogos).values({ ligaVereinId: lv.id, png });
    const params = { params: Promise.resolve({ slug: "logo-vorschau-test" }) };

    vorschauCookie = undefined;
    expect((await logoRoute.GET(new Request("http://x/"), params)).status).toBe(404);
    expect((await manifestRoute.GET(new Request("http://x/"), params)).status).toBe(404);

    vorschauCookie = await v.erzeugeVorschauLink(vereinId, 1, "test");
    const logo = await logoRoute.GET(new Request("http://x/"), params);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("Content-Type")).toBe("image/png");
    // Antwort hängt am Cookie → darf nie im gemeinsamen Cache landen
    expect(logo.headers.get("Cache-Control")).toContain("private");
    expect((await manifestRoute.GET(new Request("http://x/"), params)).status).toBe(200);

    // Link-Vorschau-Crawler (kein Cookie): Titel + Logo über den Token
    vorschauCookie = undefined;
    const tokenRoute = await import("@/app/verein/[slug]/vorschau/[token]/route");
    const tokenLogo = await import("@/app/verein/[slug]/vorschau/[token]/logo/route");
    const token = await v.erzeugeVorschauLink(vereinId, 1, "test");
    const tp = { params: Promise.resolve({ slug: "logo-vorschau-test", token }) };
    const bot = await tokenRoute.GET(new Request("http://x/", { headers: { "user-agent": "WhatsApp/2.23" } }), tp);
    expect(bot.status).toBe(200);
    const html = await bot.text();
    expect(html).toContain('og:image');
    expect(html).toContain(`/verein/logo-vorschau-test/vorschau/${token}/logo`);
    expect((await tokenLogo.GET(new Request("http://x/"), tp)).status).toBe(200);
    expect((await tokenLogo.GET(new Request("http://x/"), { params: Promise.resolve({ slug: "logo-vorschau-test", token: "falsch" }) })).status).toBe(404);
    // normaler Browser: weiter Umleitung mit Cookie
    expect((await tokenRoute.GET(new Request("http://x/", { headers: { "user-agent": "Mozilla/5.0" } }), tp)).status).toBe(307);
    vorschauCookie = undefined;
  });

  it("Vorschau-Link öffnet einen Verein in Vorbereitung nur befristet, widerrufbar und nur für diesen Verein", async () => {
    const t = await import("./treuhand");
    const v = await import("./verein-vorschau");
    const { holeVerein, holeVorschau } = await import("./liga-oeffentlich");
    const vereinId = await t.vereinVorbereiten(sysAdminId, "Vorschau Verein");
    const anderer = await t.vereinVorbereiten(sysAdminId, "Anderer Vorschau Verein");
    angelegt.push(vereinId, anderer);
    await testDb.insert(schema.ligaVereine).values([
      { vereinId, slug: "vorschau-verein-test", name: "Vorschau Verein", nuligaClubId: "999991" },
      { vereinId: anderer, slug: "anderer-vorschau-test", name: "Anderer", nuligaClubId: "999992" },
    ]);
    const token = await v.erzeugeVorschauLink(vereinId, 1, "test");
    vorschauCookie = undefined;
    expect(await holeVerein("vorschau-verein-test")).toBeUndefined();

    vorschauCookie = token;
    const lv = await holeVerein("vorschau-verein-test");
    expect(lv?.id).toBeDefined();
    expect((await holeVorschau(vereinId))?.art).toBe("link");
    // gilt nicht für einen anderen Verein
    expect(await holeVerein("anderer-vorschau-test")).toBeUndefined();

    // abgelaufen
    await testDb
      .update(schema.vereinVorschauLinks)
      .set({ gueltigBis: new Date(Date.now() - 1000) })
      .where(eq(schema.vereinVorschauLinks.token, token));
    expect(await holeVerein("vorschau-verein-test")).toBeUndefined();

    // widerrufen
    const token2 = await v.erzeugeVorschauLink(vereinId, 3, "test");
    vorschauCookie = token2;
    expect(await holeVerein("vorschau-verein-test")).toBeDefined();
    const [l] = await v.holeAktiveVorschauLinks(vereinId);
    await v.widerrufeVorschauLink(l.id, "test");
    expect(await holeVerein("vorschau-verein-test")).toBeUndefined();
    vorschauCookie = undefined;
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
