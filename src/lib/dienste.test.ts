import { describe, expect, it } from "vitest";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "./dienste";

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

  it("Zeitnehmer-Override (Zeitnehmerwart) übersteuert den globalen Bedarf für einen einzelnen Termin, inklusive 0", () => {
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer", null, null, 0)).toBe(0);
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer", null, null, 3)).toBe(3);
    expect(bedarfFuer(verein, "spiel_ics", "zeitnehmer", null, null, 2)).toBe(2);
  });

  it("Zeitnehmer-Override gilt nicht für Ordner/Kioskdienst", () => {
    expect(bedarfFuer(verein, "testspiel", "ordner", null, null, 0)).toBe(2);
  });

  it("ohne gesetzten Override (null/undefined) gilt weiterhin der globale Bedarf", () => {
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer", null, null, null)).toBe(7);
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer", null, null, undefined)).toBe(7);
  });

  it("liefert 0, wenn der Bedarf für die Mannschaft deaktiviert ist", () => {
    expect(bedarfFuer(verein, "testspiel", "ordner", null, null, null, true)).toBe(0);
    expect(bedarfFuer(verein, "turnier", "kioskdienst", null, null, null, true)).toBe(0);
    expect(bedarfFuer(verein, "rundenspiel", "zeitnehmer", true, null, null, true)).toBe(0);
  });

  it("ohne Deaktivierung (false/undefined) gilt weiterhin der globale Bedarf", () => {
    expect(bedarfFuer(verein, "testspiel", "ordner", null, null, null, false)).toBe(2);
    expect(bedarfFuer(verein, "testspiel", "ordner", null, null, null, undefined)).toBe(2);
  });

  it("ein expliziter Zeitnehmer-Override für einen Termin geht der Mannschafts-Deaktivierung vor", () => {
    expect(bedarfFuer(verein, "testspiel", "zeitnehmer", null, null, 3, true)).toBe(3);
  });
});

describe("mannschaftBedarfDeaktiviertFuer", () => {
  const mannschaft = {
    ordnerBedarfDeaktiviert: true,
    kioskdienstBedarfDeaktiviert: false,
    zeitnehmerBedarfDeaktiviert: true,
  };

  it("wählt das zur Rolle passende Flag", () => {
    expect(mannschaftBedarfDeaktiviertFuer(mannschaft, "ordner")).toBe(true);
    expect(mannschaftBedarfDeaktiviertFuer(mannschaft, "kioskdienst")).toBe(false);
    expect(mannschaftBedarfDeaktiviertFuer(mannschaft, "zeitnehmer")).toBe(true);
  });

  it("liefert false ohne Mannschaftsbezug", () => {
    expect(mannschaftBedarfDeaktiviertFuer(null, "ordner")).toBe(false);
    expect(mannschaftBedarfDeaktiviertFuer(undefined, "ordner")).toBe(false);
  });
});
