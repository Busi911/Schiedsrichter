// Zahlungs-Mails gegen ein ECHTES Postgres (übersprungen ohne TEST_DATABASE_ADMIN_URL): jede Stufe geht je Periode nur einmal raus,
// befreite Vereine bekommen nichts, bei Sponsor-Vereinen nur die Systemadmins.
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
const pool = new Pool({ connectionString: ADMIN_URL ?? "postgres://unused" });
const testDb = drizzle(pool, { schema });
const mailSpy = vi.fn();
vi.mock("@/db/admin", () => ({ adminDb: testDb }));
vi.mock("server-only", () => ({}));
vi.mock("./mailer", () => ({ sendMail: (...a: unknown[]) => mailSpy(...a) }));

describe.skipIf(!ADMIN_URL)("Zahlungs-Mails (Postgres)", () => {
  const ids = { beta: randomUUID(), befreit: randomUUID(), sponsor: randomUUID() };
  const systemAdminId = randomUUID();
  const tag = (s: string) => new Date(`${s}T12:00:00+01:00`);
  // Nur Mails zu den Test-Vereinen (die Test-Datenbank kann weitere Vereine/Systemadmins aus anderen Tests enthalten).
  const mails = (name: string) => mailSpy.mock.calls.filter((c) => (c[1] as string).includes(name));
  const an = (name: string) => mails(name).map((c) => c[0] as string).sort();
  const alleAn = () => mailSpy.mock.calls.map((c) => c[0] as string);

  beforeAll(async () => {
    await testDb.insert(schema.vereine).values([
      { id: ids.beta, name: "Beta-Verein", tarif: "beta", rechnungEmail: "rechnung@beta.test" },
      { id: ids.befreit, name: "Befreiter Verein", tarif: "befreit" },
      { id: ids.sponsor, name: "Sponsor-Verein", tarif: "beta", sponsorUebernimmt: true },
    ]);
    await testDb.insert(schema.users).values([
      { id: systemAdminId, email: "sys@zahlung.test", name: "Sys", istSystemAdmin: true },
      { email: "admin@beta.test", name: "A", vereinId: ids.beta, istAdmin: true },
      { email: "admin@befreit.test", name: "B", vereinId: ids.befreit, istAdmin: true },
      { email: "admin@sponsor.test", name: "S", vereinId: ids.sponsor, istAdmin: true },
    ]);
  });
  afterAll(async () => {
    await testDb.delete(schema.vereine).where(inArray(schema.vereine.id, Object.values(ids)));
    await testDb.delete(schema.users).where(eq(schema.users.id, systemAdminId));
    await pool.end();
  });
  beforeEach(() => mailSpy.mockClear());

  it("vor dem Vorlauf (Oktober) geht nichts raus", async () => {
    const { pruefeZahlungen } = await import("./zahlung-erinnerung");
    await pruefeZahlungen(tag("2026-10-07"));
    expect(mails("Beta-Verein")).toHaveLength(0);
  });

  it("1.12.2026: Beta-Verein und Sponsor-Verein melden sich beim Systemadmin, nur der Beta-Verein selbst an Admin und Rechnungs-E-Mail; befreit nie", async () => {
    const { pruefeZahlungen } = await import("./zahlung-erinnerung");
    await pruefeZahlungen(tag("2026-12-01"));
    expect(an("Beta-Verein")).toContain("sys@zahlung.test");
    expect(alleAn()).toEqual(expect.arrayContaining(["admin@beta.test", "rechnung@beta.test"]));
    expect(an("Sponsor-Verein")).toContain("sys@zahlung.test");
    expect(alleAn()).not.toContain("admin@sponsor.test"); // der Sponsor zahlt: der Verein selbst bekommt keine Zahlungsmail
    expect(alleAn()).not.toContain("admin@befreit.test");
    expect(mails("Befreiter")).toHaveLength(0);
  });

  it("derselbe Tag nochmal: nichts doppelt; nach Fälligkeit (Stufe 2) wieder je einmal", async () => {
    const { pruefeZahlungen } = await import("./zahlung-erinnerung");
    await pruefeZahlungen(tag("2026-12-02"));
    expect(mails("Beta-Verein")).toHaveLength(0);
    await pruefeZahlungen(tag("2027-01-05"));
    expect(an("Beta-Verein").filter((e) => e === "sys@zahlung.test")).toHaveLength(1);
    expect(mails("Beta-Verein").some((c) => (c[1] as string).includes("Überfällig"))).toBe(true);
    mailSpy.mockClear();
    await pruefeZahlungen(tag("2027-01-06"));
    expect(mails("Beta-Verein")).toHaveLength(0);
  });

  it("bezahlt: neue Periode, 30 Tage vor Ablauf wieder die erste Stufe", async () => {
    const { pruefeZahlungen } = await import("./zahlung-erinnerung");
    await testDb.update(schema.vereine).set({ zahlungBis: tag("2027-11-30"), zahlungFaelligAm: null, zahlungMailMarke: null }).where(eq(schema.vereine.id, ids.beta));
    await pruefeZahlungen(tag("2027-06-01"));
    expect(mails("Beta-Verein")).toHaveLength(0);
    mailSpy.mockClear();
    await pruefeZahlungen(tag("2027-11-05"));
    expect(alleAn()).toContain("rechnung@beta.test");
  });
});
