import { describe, expect, it } from "vitest";
import { bedarfFuer } from "./dienste";

const verein = {
  testspielOrdnerBedarf: 2,
  testspielKioskdienstBedarf: 1,
  turnierOrdnerBedarf: 4,
  turnierKioskdienstBedarf: 3,
  rundenspielOrdnerBedarf: 5,
  rundenspielKioskdienstBedarf: 6,
  testspielZeitnehmerBedarf: 7,
  turnierZeitnehmerBedarf: 8,
  rundenspielZeitnehmerBedarf: 9,
};

describe("bedarfFuer", () => {
  it("liefert den Ordner-Bedarf für Testspiele", () => {
    expect(bedarfFuer(verein, "testspiel", "ordner")).toBe(2);
  });

  it("liefert den Kioskdienst-Bedarf für Testspiele", () => {
    expect(bedarfFuer(verein, "testspiel", "kioskdienst")).toBe(1);
  });

  it("liefert den Ordner-Bedarf für Turniere", () => {
    expect(bedarfFuer(verein, "turnier", "ordner")).toBe(4);
  });

  it("liefert den Kioskdienst-Bedarf für Turniere", () => {
    expect(bedarfFuer(verein, "turnier", "kioskdienst")).toBe(3);
  });

  it("liefert 0 für spiel_ics (persönliche Einsätze, kein Vereins-Dienst)", () => {
    expect(bedarfFuer(verein, "spiel_ics", "ordner")).toBe(0);
    expect(bedarfFuer(verein, "spiel_ics", "kioskdienst")).toBe(0);
  });

  it("liefert 0 für unbekannte Termin-Typen", () => {
    expect(bedarfFuer(verein, "unbekannt", "ordner")).toBe(0);
  });

  it("liefert den Ordner-/Kioskdienst-Bedarf für echte Ligaspiele (pflichtspiel = true)", () => {
    expect(bedarfFuer(verein, "rundenspiel", "ordner", true)).toBe(5);
    expect(bedarfFuer(verein, "rundenspiel", "kioskdienst", true)).toBe(6);
  });

  it("liefert den Ordner-/Kioskdienst-Bedarf für Rundenspiele ohne pflichtspiel-Angabe unverändert (Altfall/unbekannter Typ)", () => {
    expect(bedarfFuer(verein, "rundenspiel", "ordner")).toBe(5);
    expect(bedarfFuer(verein, "rundenspiel", "kioskdienst")).toBe(6);
  });

  it("liefert den Testspiel-Bedarf für Freundschaftsspiele im Liga-Spielplan (pflichtspiel = false, freundschaftsTyp = 'freundschaftsspiel')", () => {
    expect(
      bedarfFuer(verein, "rundenspiel", "ordner", false, "freundschaftsspiel")
    ).toBe(2);
    expect(
      bedarfFuer(verein, "rundenspiel", "kioskdienst", false, "freundschaftsspiel")
    ).toBe(1);
  });

  it("liefert den Turnier-Bedarf für Turniere im Liga-Spielplan (pflichtspiel = false, freundschaftsTyp = 'turnier')", () => {
    expect(bedarfFuer(verein, "rundenspiel", "ordner", false, "turnier")).toBe(4);
    expect(bedarfFuer(verein, "rundenspiel", "kioskdienst", false, "turnier")).toBe(3);
  });

  it("liefert den Testspiel-Bedarf als Fallback, wenn freundschaftsTyp bei pflichtspiel = false nicht eindeutig ist", () => {
    expect(bedarfFuer(verein, "rundenspiel", "ordner", false, null)).toBe(2);
    expect(bedarfFuer(verein, "rundenspiel", "ordner", false)).toBe(2);
  });

  it("liefert den Zeitnehmer-Bedarf für Testspiele/Turniere/echte Ligaspiele", () => {
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer")).toBe(7);
    expect(bedarfFuer(verein, "turnier", "zeitnehmer")).toBe(8);
    expect(bedarfFuer(verein, "rundenspiel", "zeitnehmer", true)).toBe(9);
  });

  it("liefert den Zeitnehmer-Bedarf für Freundschaftsspiel/Turnier im Liga-Spielplan passend zum freundschaftsTyp", () => {
    expect(
      bedarfFuer(verein, "rundenspiel", "zeitnehmer", false, "freundschaftsspiel")
    ).toBe(7);
    expect(bedarfFuer(verein, "rundenspiel", "zeitnehmer", false, "turnier")).toBe(8);
  });

  it("liefert für spiel_ics einen festen Zeitnehmer-Standardbedarf (nicht konfigurierbar, persönlicher Einsatz)", () => {
    expect(bedarfFuer(verein, "spiel_ics", "zeitnehmer")).toBe(1);
  });
});
