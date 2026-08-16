import { describe, expect, it } from "vitest";
import {
  offeneSchiedsrichterInhalt,
  offenerSchiedsrichterTerminZeile,
} from "./schiedsrichterwart-erinnerung";
import type { OffenerSchiedsrichterTermin } from "./dashboard";

const termin: OffenerSchiedsrichterTermin = {
  terminId: "t1",
  start: new Date("2026-09-01T10:00:00Z"),
  typ: "testspiel",
  ort: "Halle 1",
  mannschaftLabel: "Herren 1",
};

describe("offenerSchiedsrichterTerminZeile", () => {
  it("enthält Zeitpunkt, Typ, Mannschaft und Ort", () => {
    const zeile = offenerSchiedsrichterTerminZeile(termin);
    expect(zeile).toContain("Freundschaftsspiel");
    expect(zeile).toContain("Herren 1");
    expect(zeile).toContain("Halle 1");
  });
});

describe("offeneSchiedsrichterInhalt", () => {
  it("verwendet Singular in der Überschrift bei genau einem Termin", () => {
    const inhalt = offeneSchiedsrichterInhalt("Musterverein", [termin]);
    expect(inhalt.ueberschrift).toContain("1 Spiel ");
    expect(inhalt.zeilen).toHaveLength(1);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/profil/schiedsrichterwart");
  });

  it("verwendet Plural bei mehreren Terminen", () => {
    const inhalt = offeneSchiedsrichterInhalt("Musterverein", [termin, termin]);
    expect(inhalt.ueberschrift).toContain("2 Spiele");
    expect(inhalt.zeilen).toHaveLength(2);
  });
});
