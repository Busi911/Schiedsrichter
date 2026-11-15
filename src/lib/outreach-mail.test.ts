import { describe, expect, it } from "vitest";
import { outreachInhalt } from "./outreach-mail";

describe("outreachInhalt", () => {
  const inhalt = outreachInhalt({
    jetzt: new Date("2026-11-01T10:00:00Z"),
    vereinsname: "HSG Linden",
    vorschauUrl: "https://handballerpate.de/verein/hsg-linden/vorschau/abc",
    gueltigBis: new Date("2026-10-15T10:00:00Z"),
    email: "test@example.org",
    abmeldeUrl: "https://handballerpate.de/api/outreach/abmelden/token123",
    uebergabeUrl: "https://handballerpate.de/outreach/uebergabe/token456",
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

  it("betont unverbindlich und Risiko-frei", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("unverbindlich");
    expect(text).toContain("Zahlungen");
  });

  it("hat einen CTA-Button mit der Übergabe-URL", () => {
    expect(inhalt.cta?.url).toBe("https://handballerpate.de/outreach/uebergabe/token456");
    expect(inhalt.cta?.text).toBe("Kostenlos testen");
  });

  it("hat einen Vorschau-Link als Sekundär-Link", () => {
    expect(inhalt.vorschauUrl).toBe("https://handballerpate.de/verein/hsg-linden/vorschau/abc");
  });

  it("verlinkt die Demo der Verwaltung zusätzlich zur Vorschau und zum Test-Button", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("/demo");
    expect(text).toContain("Demo mit Testdaten");
    // Vorschau-Link und CTA bleiben unverändert erhalten
    expect(inhalt.vorschauUrl).toBe("https://handballerpate.de/verein/hsg-linden/vorschau/abc");
    expect(inhalt.cta?.text).toBe("Kostenlos testen");
  });

  it("hat einen Abmelde-Hinweis", () => {
    expect(inhalt.abmelden?.url).toContain("/api/outreach/abmelden/");
    expect(inhalt.kleingedrucktes).toContain("berechtigten Interesse");
  });

  it("erwähnt Spielgemeinschaften und Zusatzquellen", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("Spielgemeinschaften");
    expect(text).toContain("Zusatzquellen");
  });

  it("erwähnt die zwei Funktionen (App + Verein)", () => {
    const text = JSON.stringify(inhalt.zeilen);
    expect(text).toContain("Schiedsrichter");
    expect(text).toContain("Spielplan");
    expect(text).toContain("nuLiga");
  });

  it("nennt die freien Beta-Plätze und wechselt bei vollem Kontingent auf den regulären Preis", () => {
    const basis = {
      vereinsname: "HSG Linden",
      vorschauUrl: "https://handballerpate.de/verein/hsg-linden/vorschau/abc",
      gueltigBis: new Date("2026-10-15T10:00:00Z"),
      email: "test@example.org",
      abmeldeUrl: "https://handballerpate.de/api/outreach/abmelden/token123",
      uebergabeUrl: "https://handballerpate.de/outreach/uebergabe/token456",
      jetzt: new Date("2026-11-01T10:00:00Z"),
    };
    expect(JSON.stringify(inhalt.zeilen)).not.toContain("Beta-Platz");
    expect(JSON.stringify(outreachInhalt({ ...basis, betaPlaetzeFrei: 1 }).zeilen)).toContain("Es ist nur noch ein Beta-Platz frei.");
    const voll = outreachInhalt({ ...basis, betaPlaetzeFrei: 0 });
    const text = JSON.stringify(voll.zeilen);
    expect(text).toContain("Beta-Plätze sind inzwischen vergeben");
    expect(text).toContain("300 €");
    expect(text).toContain("14 Tage kostenlos");
    expect(text).not.toContain("komplett kostenlos");
    expect(voll.cta?.text).toBe("Verein übernehmen");
  });

  it("wechselt nach dem Beta-Ende von selbst auf Testphase und regulären Preis (auch bei freien Plätzen)", () => {
    const basis = {
      vereinsname: "HSG Linden",
      vorschauUrl: "https://handballerpate.de/verein/hsg-linden/vorschau/abc",
      gueltigBis: new Date("2026-12-10T10:00:00Z"),
      email: "test@example.org",
      abmeldeUrl: "https://handballerpate.de/api/outreach/abmelden/token123",
      uebergabeUrl: "https://handballerpate.de/outreach/uebergabe/token456",
      betaPlaetzeFrei: 1,
    };
    const vorher = outreachInhalt({ ...basis, jetzt: new Date("2026-11-30T22:59:00Z") });
    expect(JSON.stringify(vorher.zeilen)).toContain("Beta-Phase");
    const nachher = outreachInhalt({ ...basis, jetzt: new Date("2026-11-30T23:00:00Z") });
    const text = JSON.stringify(nachher.zeilen);
    expect(text).toContain("14 Tage kostenlos");
    expect(text).toContain("300 €");
    expect(text).not.toContain("Beta-Phase");
    expect(text).not.toContain("Beta-Platz");
    expect(nachher.cta?.text).toBe("Verein übernehmen");
  });
});
