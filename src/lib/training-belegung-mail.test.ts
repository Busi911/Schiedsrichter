import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("./mailer", () => ({ sendMail: vi.fn() }));
vi.stubEnv("AUTH_SECRET", "test-secret");
vi.stubEnv("APP_URL", "https://example.test");

import { trainingBelegungInhalt } from "./training-belegung-mail";

const basis = {
  vereinName: "HSG Muster",
  halle: "Sporthalle Nord (Halle A)",
  datum: "2026-10-22",
  startMinuten: 18 * 60,
  endMinuten: 19 * 60 + 30,
  ausfallMannschaft: "Herren (Mä)",
  belegtVon: "mC",
  notiz: null,
  variante: "belegt" as const,
};

describe("trainingBelegungInhalt", () => {
  it("belegt: nennt wer, wann, wo und für welche ausfallende Mannschaft; Notiz nur wenn vorhanden", () => {
    const i = trainingBelegungInhalt(basis);
    const text = JSON.stringify(i);
    expect(i.ueberschrift).toBe("Frei gewordene Zeit belegt: mC nutzt Sporthalle Nord (Halle A) am Do., 22.10.");
    expect(text).toContain("Donnerstag, 22.10., 18:00–19:30 Uhr");
    expect(text).toContain("Herren (Mä)");
    expect(text).not.toContain("Notiz:");
    expect(JSON.stringify(trainingBelegungInhalt({ ...basis, notiz: "Testspiel" }))).toContain("Notiz: Testspiel");
    expect(i.cta?.url).toMatch(/\/profil\/training$/);
  });
  it("wieder frei: lädt zum Belegen ein", () => {
    const i = trainingBelegungInhalt({ ...basis, variante: "wieder_frei" });
    expect(i.ueberschrift).toMatch(/^Wieder frei:/);
    expect(i.cta?.text).toBe("Zeit belegen");
  });
  it("entfällt: sagt der buchenden Mannschaft, dass die Ausfallmannschaft doch trainiert", () => {
    const i = trainingBelegungInhalt({ ...basis, variante: "entfaellt" });
    expect(i.ueberschrift).toBe("Belegung entfällt: Herren (Mä) trainiert am Do., 22.10. doch");
  });
});
