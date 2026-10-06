import { describe, expect, it } from "vitest";
import { ansprachetext, normalisiereInstagram } from "./verein-ansprache";

describe("normalisiereInstagram", () => {
  it("akzeptiert Name, @Name und Profil-URL", () => {
    for (const x of ["hsg_linden", "@HSG_Linden", " https://www.instagram.com/hsg_linden/?hl=de ", "instagram.com/hsg_linden"]) {
      expect(normalisiereInstagram(x)).toEqual({ name: "hsg_linden", url: "https://www.instagram.com/hsg_linden/" });
    }
  });
  it("lehnt Ungültiges und fremde Adressen ab", () => {
    for (const x of ["", "  ", "mit leerzeichen", "a/b", "https://evil.example/hsg", ".punkt", "ende.", "zwei..punkte", "x".repeat(31), "<script>"]) {
      expect(normalisiereInstagram(x), x).toBeNull();
    }
  });
});

describe("ansprachetext", () => {
  const text = ansprachetext({ vereinsname: "HSG Linden", vorschauUrl: "https://handballerpate.de/verein/hsg-linden/vorschau/abc", gueltigBis: new Date("2026-10-13T10:00:00Z"), absender: "Dennis" });
  it("enthält Verein, Link, Beta/kostenlos, Gültigkeit und Absender", () => {
    expect(text).toContain("Hallo HSG Linden-Team,");
    expect(text).toContain("https://handballerpate.de/verein/hsg-linden/vorschau/abc");
    expect(text).toContain("Beta-Phase");
    expect(text).toContain("noch kostenlos");
    expect(text).toContain("bis 13.10.2026 gültig");
    expect(text.trimEnd().endsWith("Dennis")).toBe(true);
  });
  it("passt in eine Instagram-Nachricht (höchstens 1000 Zeichen)", () => {
    expect(text.length).toBeLessThan(1000);
  });
});
