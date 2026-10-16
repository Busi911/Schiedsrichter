import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("./mailer", () => ({ sendMail: vi.fn() }));
vi.stubEnv("AUTH_SECRET", "test-secret");
vi.stubEnv("APP_URL", "https://example.test");

import { vereinsterminInhalt } from "./vereinstermin-mail";

const basis = {
  vereinName: "HSG Muster",
  id: "abc",
  titel: "Vorstandssitzung",
  art: "sitzung",
  start: new Date("2026-11-05T18:00:00Z"),
  ende: new Date("2026-11-05T20:00:00Z"),
  ort: "Vereinsheim",
  beschreibung: "Haushalt 2027",
  antwortAbfrage: true,
  variante: "einladung" as const,
};

describe("vereinsterminInhalt", () => {
  it("Einladung: Titel, Ort, Beschreibung, Bitte um Antwort und Link zum Termin", () => {
    const i = vereinsterminInhalt(basis);
    const text = JSON.stringify(i);
    expect(i.ueberschrift).toBe("Einladung: Sitzung: Vorstandssitzung");
    expect(text).toContain("Ort: Vereinsheim");
    expect(text).toContain("Haushalt 2027");
    expect(text).toContain("Bescheid");
    expect(i.cta).toEqual({ text: "Zu- oder absagen", url: "https://example.test/profil/vereinstermine#termin-abc" });
  });
  it("ohne Antwortabfrage kein Bitte um Antwort", () => {
    const i = vereinsterminInhalt({ ...basis, antwortAbfrage: false });
    expect(JSON.stringify(i)).not.toContain("Bescheid");
    expect(i.cta?.text).toBe("Termin ansehen");
  });
  it("Änderung nennt, was geändert wurde; Absage hat keinen Link", () => {
    const g = vereinsterminInhalt({ ...basis, variante: "geaendert", geaendert: ["Beginn", "Ort"] });
    expect(g.ueberschrift).toMatch(/^Geändert:/);
    expect(JSON.stringify(g)).toContain("Beginn, Ort");
    const a = vereinsterminInhalt({ ...basis, variante: "abgesagt" });
    expect(a.ueberschrift).toMatch(/^Abgesagt:/);
    expect(a.cta).toBeUndefined();
  });
});
