import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("./mailer", () => ({ sendMail: vi.fn() }));
vi.stubEnv("AUTH_SECRET", "test-secret");
vi.stubEnv("APP_URL", "https://example.test");

import { trainingAusfallInhalt } from "./training-ausfall-mail";

describe("trainingAusfallInhalt", () => {
  const basis = {
    vereinName: "HSG Muster",
    mannschaft: "mC",
    halle: "Sporthalle Nord (Halle A)",
    datum: "2026-10-22",
    startMinuten: 17 * 60 + 30,
    endMinuten: 19 * 60,
    grund: null,
  };
  it("nennt Datum, Zeit, Mannschaft und Halle und verweist auf den Plan", () => {
    const i = trainingAusfallInhalt(basis);
    const text = JSON.stringify(i);
    expect(i.ueberschrift).toContain("Sporthalle Nord (Halle A)");
    expect(text).toContain("Donnerstag, 22.10.");
    expect(text).toContain("17:30–19:00 Uhr");
    expect(text).toContain("mC");
    expect(i.cta?.url).toMatch(/\/profil\/training$/);
  });
  it("Grund nur, wenn angegeben", () => {
    expect(JSON.stringify(trainingAusfallInhalt(basis))).not.toContain("Grund:");
    expect(JSON.stringify(trainingAusfallInhalt({ ...basis, grund: "Halle gesperrt" }))).toContain("Grund: Halle gesperrt");
  });
  it("Rücknahme sagt, dass die Halle wieder belegt ist", () => {
    const i = trainingAusfallInhalt({ ...basis, art: "findet_statt" });
    expect(i.ueberschrift).toMatch(/findet doch statt/);
    expect(JSON.stringify(i)).toContain("nicht mehr frei");
  });
});
