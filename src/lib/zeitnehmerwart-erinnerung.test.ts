import { describe, expect, it } from "vitest";
import {
  offeneZeitnehmerInhalt,
  offenerZeitnehmerTerminZeile,
} from "./zeitnehmerwart-erinnerung";
import type { OffenerZeitnehmerTermin } from "./dashboard";

const termin: OffenerZeitnehmerTermin = {
  terminId: "t1",
  start: new Date("2026-09-01T10:00:00Z"),
  typ: "rundenspiel",
  ort: "Halle 1",
  mannschaftLabel: "Herren 1",
  vorhanden: 1,
  bedarf: 2,
};

describe("offenerZeitnehmerTerminZeile", () => {
  it("enthält Zeitpunkt, Mannschaft, Ort und den Besetzungsstand", () => {
    const zeile = offenerZeitnehmerTerminZeile(termin);
    expect(zeile).toContain("Herren 1");
    expect(zeile).toContain("Halle 1");
    expect(zeile).toContain("1/2 Zeitnehmer/Sekretär");
  });
});

describe("offeneZeitnehmerInhalt", () => {
  it("verwendet Singular in der Überschrift bei genau einem Termin", () => {
    const inhalt = offeneZeitnehmerInhalt("Musterverein", [termin]);
    expect(inhalt.ueberschrift).toContain("1 Termin ");
    expect(inhalt.zeilen).toHaveLength(1);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/profil/zeitnehmerwart");
  });

  it("verwendet Plural bei mehreren Terminen", () => {
    const inhalt = offeneZeitnehmerInhalt("Musterverein", [termin, termin]);
    expect(inhalt.ueberschrift).toContain("2 Termine");
    expect(inhalt.zeilen).toHaveLength(2);
  });
});
