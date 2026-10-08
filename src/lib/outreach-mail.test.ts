import { describe, expect, it } from "vitest";
import { outreachInhalt } from "./outreach-mail";

describe("outreachInhalt", () => {
  const inhalt = outreachInhalt({
    vereinsname: "HSG Linden",
    vorschauUrl: "https://handballerpate.de/verein/hsg-linden/vorschau/abc",
    gueltigBis: new Date("2026-10-15T10:00:00Z"),
    email: "test@example.org",
    abmeldeUrl: "https://handballerpate.de/api/outreach/abmelden/token123",
  });

  it("enthält Vereinsname, Vorschau-Link und Absender", () => {
    expect(inhalt.vereinName).toBe("HSG Linden");
    expect(inhalt.ueberschrift).toContain("HSG Linden");
    expect(inhalt.ueberschrift).toContain("HandballerPate");
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("https://handballerpate.de/verein/hsg-linden/vorschau/abc");
    expect(text).toContain("Dennis");
  });

  it("enthält Beta-Hinweis und Preis", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("Beta-Phase");
    expect(text).toContain("kostenlos");
  });

  it("hat einen CTA-Button mit der Vorschau-URL", () => {
    expect(inhalt.cta?.url).toBe("https://handballerpate.de/verein/hsg-linden/vorschau/abc");
    expect(inhalt.cta?.text).toBe("Vorschau öffnen");
  });

  it("hat einen Abmelde-Hinweis", () => {
    expect(inhalt.abmelden?.url).toContain("/api/outreach/abmelden/");
    expect(inhalt.kleingedrucktes).toContain("berechtigtes Interesse");
  });

  it("erwähnt die zwei Funktionen (App + Verein)", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("Schiedsrichter");
    expect(text).toContain("Spielplan");
    expect(text).toContain("nuLiga");
  });
});
