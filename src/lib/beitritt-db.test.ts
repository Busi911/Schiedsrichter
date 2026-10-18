// Integrationstest: Online-Beitritt (übersprungen ohne TEST_DATABASE_ADMIN_URL).
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

process.env.AUTH_SECRET = "test-secret-fuer-beitritt";
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
// holeVerein nutzt react-cache und (bei Vereinen in Vorbereitung) die Cookies der Anfrage: im Test direkt aus der Datenbank.
vi.mock("@/lib/liga-oeffentlich", () => ({
  holeVerein: async (slug: string) => testDb.query.ligaVereine.findFirst({ where: eq(schema.ligaVereine.slug, slug) }),
}));

type Modul = typeof import("./beitritt-daten");
let m: Modul;
type Abmelden = typeof import("./abmelden");
let ab: Abmelden;

describe.skipIf(!ADMIN_URL)("Online-Beitritt (Postgres)", () => {
  const tag = randomUUID().slice(0, 8);
  const A = randomUUID();
  const B = randomUUID();
  const slugA = `beitritt-a-${tag}`;
  let mannschaftA: string;
  let mannschaftB: string;
  const email = (n: string) => `${n}-${tag}@beitritt.test`;
  const eingabe = (n: string, teil: Partial<import("./beitritt").BeitrittEingabe> = {}) => ({
    vorname: `Vor${n}`, name: `Nach${n}`, geburtsdatum: "2010-05-20", email: email(n), telefon: "", geschlecht: "", mannschaftId: "", datenschutz: true, satzung: false, fotos: false, ...teil,
  });
  const antraegeA = () => testDb.select().from(schema.beitrittAntraege).where(eq(schema.beitrittAntraege.vereinId, A));

  beforeAll(async () => {
    m = await import("./beitritt-daten");
    ab = await import("./abmelden");
    await testDb.insert(schema.vereine).values([
      { id: A, name: `TSV Beitritt ${tag}`, status: "aktiv", vereinsverwaltungAktiv: true, beitrittAktiv: true },
      { id: B, name: `TSV Anders ${tag}`, status: "aktiv", vereinsverwaltungAktiv: true, beitrittAktiv: true },
    ]);
    const mk = async (vereinId: string, slug: string) => {
      const [lv] = await testDb.insert(schema.ligaVereine).values({ vereinId, slug, name: slug }).returning({ id: schema.ligaVereine.id });
      const [lm] = await testDb.insert(schema.ligaMannschaften).values({ ligaVereinId: lv.id, slug: "m1", schluessel: "herren::1", name: "Männer", kategorie: "herren" }).returning({ id: schema.ligaMannschaften.id });
      return lm.id;
    };
    mannschaftA = await mk(A, slugA);
    mannschaftB = await mk(B, `beitritt-b-${tag}`);
    await testDb.insert(schema.users).values([
      { id: `a1-${tag}`, email: email("admin1"), vereinId: A, istAdmin: true, adminHinweiseAktiviert: true },
      { id: `a2-${tag}`, email: email("admin2"), vereinId: A, istAdmin: true, adminHinweiseAktiviert: true },
      { id: `l1-${tag}`, email: email("lesend"), vereinId: A, istAdminLesend: true },
    ]);
  });
  beforeEach(() => mailSpy.mockClear());
  afterAll(async () => {
    for (const id of [A, B]) await testDb.delete(schema.vereine).where(eq(schema.vereine.id, id));
    await testDb.delete(schema.users).where(eq(schema.users.vereinId, A));
    await pool.end();
    await appPool.end();
  });

  it("Seite nur mit Add-on UND eingeschaltetem Beitritt", async () => {
    expect((await m.ladeBeitrittsSeite(slugA))?.vereinName).toBe(`TSV Beitritt ${tag}`);
    expect(await m.ladeBeitrittsSeite("gibt-es-nicht")).toBeNull();
    await testDb.update(schema.vereine).set({ beitrittAktiv: false }).where(eq(schema.vereine.id, A));
    expect(await m.ladeBeitrittsSeite(slugA)).toBeNull();
    await testDb.update(schema.vereine).set({ beitrittAktiv: true, vereinsverwaltungAktiv: false }).where(eq(schema.vereine.id, A));
    expect(await m.ladeBeitrittsSeite(slugA)).toBeNull();
    await testDb.update(schema.vereine).set({ vereinsverwaltungAktiv: true }).where(eq(schema.vereine.id, A));
    expect(await m.ladeBeitrittsSeite(slugA)).not.toBeNull();
  });

  it("Einreichen speichert den Antrag und mailt beide Admins und den Antragsteller (nicht den lesenden Admin)", async () => {
    expect(await m.reicheBeitrittEin(slugA, eingabe("eins", { mannschaftId: mannschaftA }), "")).toEqual({ ok: true });
    const liste = await antraegeA();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ status: "offen", mannschaftId: mannschaftA, einwilligungen: { datenschutz: true, fotos: false, vereinigung: false } });
    const empfaenger = mailSpy.mock.calls.map((c) => c[0]);
    expect(empfaenger).toContain(email("admin1"));
    expect(empfaenger).toContain(email("admin2"));
    expect(empfaenger).toContain(email("eins"));
    expect(empfaenger).not.toContain(email("lesend"));
    // Admin-Mail: nur Name und E-Mail, mit Abmelde-Link
    const adminMail = mailSpy.mock.calls.find((c) => c[0] === email("admin1"))!;
    expect(String(adminMail[2])).toContain("Voreins Nacheins");
    expect(adminMail[4]).toHaveProperty("abmeldeUrl");
  });

  it("derselbe offene Antrag (gleiche E-Mail) wird nicht doppelt angelegt und nicht doppelt gemailt", async () => {
    mailSpy.mockClear();
    expect(await m.reicheBeitrittEin(slugA, eingabe("eins"), "")).toEqual({ ok: true });
    expect(await antraegeA()).toHaveLength(1);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("Köderfeld: scheinbar erfolgreich, aber nichts gespeichert und keine Mail", async () => {
    expect(await m.reicheBeitrittEin(slugA, eingabe("bot"), "http://spam.example")).toEqual({ ok: true });
    expect((await antraegeA()).some((a) => a.email === email("bot"))).toBe(false);
    expect(mailSpy).not.toHaveBeenCalled();
  });

  it("lehnt ungültige Eingaben, fremde Mannschaften und fehlende Satzungs-Zustimmung ab", async () => {
    expect(await m.reicheBeitrittEin(slugA, eingabe("x", { datenschutz: false }), "")).toHaveProperty("fehler");
    expect(await m.reicheBeitrittEin(slugA, eingabe("y", { mannschaftId: mannschaftB }), "")).toHaveProperty("fehler");
    await testDb.update(schema.vereine).set({ satzungUrl: "https://verein.example/satzung.pdf" }).where(eq(schema.vereine.id, A));
    expect(await m.reicheBeitrittEin(slugA, eingabe("z", { satzung: false }), "")).toHaveProperty("fehler");
    expect(await m.reicheBeitrittEin(slugA, eingabe("z", { satzung: true }), "")).toEqual({ ok: true });
    expect((await antraegeA()).find((a) => a.email === email("z"))?.einwilligungen).toMatchObject({ vereinigung: true });
    await testDb.update(schema.vereine).set({ satzungUrl: null }).where(eq(schema.vereine.id, A));
  });

  it("Begrenzung: höchstens 20 Anträge je Verein und Stunde", async () => {
    const jetzt = new Date();
    const vorher = (await antraegeA()).filter((a) => a.erstelltAm && a.erstelltAm > new Date(jetzt.getTime() - 3_600_000)).length;
    for (let i = vorher; i < 20; i++) {
      await testDb.insert(schema.beitrittAntraege).values({ vereinId: A, vorname: "V", name: `Fuell${i}`, email: email(`fuell${i}`), erstelltAm: jetzt });
    }
    const r = await m.reicheBeitrittEin(slugA, eingabe("limit"), "", jetzt);
    expect(r.ok).toBe(false);
    await testDb.delete(schema.beitrittAntraege).where(and(eq(schema.beitrittAntraege.vereinId, A), sql`${schema.beitrittAntraege.email} like ${"fuell%"}`));
  });

  it("Annehmen: Mitglied (aktiv) mit Mannschaftswunsch, Hinweis zu den Einwilligungen, Willkommens-Mail; nur einmal; nicht über einen anderen Verein", async () => {
    const antrag = (await antraegeA()).find((a) => a.email === email("eins"))!;
    expect(await m.nehmeAntragAn(B, antrag.id)).toMatchObject({ ok: false });
    mailSpy.mockClear();
    expect(await m.nehmeAntragAn(A, antrag.id)).toEqual({ ok: true });
    const mitglied = await testDb.query.mitglieder.findFirst({ where: and(eq(schema.mitglieder.vereinId, A), eq(schema.mitglieder.email, email("eins"))) });
    expect(mitglied).toMatchObject({ status: "aktiv", vorname: "Voreins", name: "Nacheins" });
    expect(mitglied?.bemerkung).toContain("Online-Beitritt");
    expect(mitglied?.bemerkung).toContain("Fotos/Videos nein");
    const zu = await testDb.select().from(schema.mitgliedMannschaften).where(eq(schema.mitgliedMannschaften.mitgliedId, mitglied!.id));
    expect(zu).toHaveLength(1);
    expect(zu[0]).toMatchObject({ mannschaftId: mannschaftA, rolle: "spieler" });
    expect(mailSpy.mock.calls.map((c) => c[0])).toEqual([email("eins")]);
    expect(await m.nehmeAntragAn(A, antrag.id)).toMatchObject({ ok: false });
    expect((await testDb.query.beitrittAntraege.findFirst({ where: eq(schema.beitrittAntraege.id, antrag.id) }))?.status).toBe("angenommen");
  });

  it("Annehmen bei möglichem Duplikat: erst nach ausdrücklicher Bestätigung", async () => {
    await testDb.insert(schema.mitglieder).values({ vereinId: A, vorname: "Voreinhorn", name: "Dopp", email: email("dopp") });
    expect(await m.reicheBeitrittEin(slugA, eingabe("dopp", { vorname: "Voreinhorn", name: "Dopp" }), "")).toEqual({ ok: true });
    const antrag = (await antraegeA()).find((a) => a.email === email("dopp"))!;
    const abgelehntBlockiert = await m.nehmeAntragAn(A, antrag.id);
    expect(abgelehntBlockiert).toMatchObject({ ok: false });
    expect((await testDb.query.beitrittAntraege.findFirst({ where: eq(schema.beitrittAntraege.id, antrag.id) }))?.status).toBe("offen");
    expect(await m.nehmeAntragAn(A, antrag.id, { trotzdem: true })).toEqual({ ok: true });
    expect(await testDb.select().from(schema.mitglieder).where(and(eq(schema.mitglieder.vereinId, A), eq(schema.mitglieder.name, "Dopp")))).toHaveLength(2);
  });

  it("Ablehnen: Status, Mail mit Hinweis, nur einmal", async () => {
    expect(await m.reicheBeitrittEin(slugA, eingabe("nein"), "")).toEqual({ ok: true });
    const antrag = (await antraegeA()).find((a) => a.email === email("nein"))!;
    mailSpy.mockClear();
    expect(await m.lehneAntragAb(A, antrag.id, "Zurzeit keine Plätze")).toEqual({ ok: true });
    const mail = mailSpy.mock.calls.find((c) => c[0] === email("nein"))!;
    expect(String(mail[2])).toContain("Zurzeit keine Plätze");
    expect(await m.lehneAntragAb(A, antrag.id, "")).toMatchObject({ ok: false });
    expect((await testDb.query.beitrittAntraege.findFirst({ where: eq(schema.beitrittAntraege.id, antrag.id) }))?.status).toBe("abgelehnt");
  });

  it("Löschen: nur bearbeitete Anträge, nur im eigenen Verein; das angenommene Mitglied bleibt", async () => {
    expect(await m.reicheBeitrittEin(slugA, eingabe("offen"), "")).toEqual({ ok: true });
    const offen = (await antraegeA()).find((a) => a.email === email("offen"))!;
    expect(await m.loescheBearbeitetenAntrag(A, offen.id)).toMatchObject({ ok: false });
    const abgelehnt = (await antraegeA()).find((a) => a.email === email("nein"))!;
    expect(await m.loescheBearbeitetenAntrag(B, abgelehnt.id)).toMatchObject({ ok: false });
    expect(await m.loescheBearbeitetenAntrag(A, abgelehnt.id)).toEqual({ ok: true });
    const angenommen = (await antraegeA()).find((a) => a.email === email("eins"))!;
    expect(await m.loescheBearbeitetenAntrag(A, angenommen.id)).toEqual({ ok: true });
    expect(await testDb.query.mitglieder.findFirst({ where: and(eq(schema.mitglieder.vereinId, A), eq(schema.mitglieder.email, email("eins"))) })).toBeDefined();
    await m.lehneAntragAb(A, offen.id, "");
  });

  it("Keiner hat die Admin-Hinweise an: der Antrag geht an alle vollen Admins (nie an lesende)", async () => {
    await testDb.update(schema.users).set({ adminHinweiseAktiviert: false }).where(eq(schema.users.vereinId, A));
    mailSpy.mockClear();
    expect(await m.reicheBeitrittEin(slugA, eingabe("fallback"), "")).toEqual({ ok: true });
    const empfaenger = mailSpy.mock.calls.map((c) => c[0]);
    expect(empfaenger).toContain(email("admin1"));
    expect(empfaenger).toContain(email("admin2"));
    expect(empfaenger).not.toContain(email("lesend"));
    await testDb.update(schema.users).set({ adminHinweiseAktiviert: true }).where(eq(schema.users.vereinId, A));
  });

  it("Admin-Hinweise: bei zwei Admins kann nur einer abschalten", async () => {
    expect(await ab.adminHinweiseAbschaltbar(`a1-${tag}`)).toBe(true);
    expect(await ab.setzeAbmeldung(`a1-${tag}`, "admin-hinweise", false)).toEqual({ ok: true });
    // a1 ist jetzt aus, a2 der Letzte
    expect(await ab.adminHinweiseAbschaltbar(`a2-${tag}`)).toBe(false);
    expect(await ab.setzeAbmeldung(`a2-${tag}`, "admin-hinweise", false)).toMatchObject({ ok: false });
    expect((await testDb.query.users.findFirst({ where: eq(schema.users.id, `a2-${tag}`) }))?.adminHinweiseAktiviert).toBe(true);
    // wieder einschalten ist immer erlaubt, danach können beide wieder entscheiden
    expect(await ab.setzeAbmeldung(`a1-${tag}`, "admin-hinweise", true)).toEqual({ ok: true });
    expect(await ab.adminHinweiseAbschaltbar(`a2-${tag}`)).toBe(true);
    // andere Mailarten sind nie gesperrt
    expect(await ab.setzeAbmeldung(`a2-${tag}`, "digest", false)).toEqual({ ok: true });
  });
});
