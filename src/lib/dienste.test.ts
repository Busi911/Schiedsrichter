import { describe, expect, it } from "vitest";
import { bedarfFuer } from "./dienste";

const verein = {
  testspielOrdnerBedarf: 2,
  testspielKioskdienstBedarf: 1,
  turnierOrdnerBedarf: 4,
  turnierKioskdienstBedarf: 3,
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
});
