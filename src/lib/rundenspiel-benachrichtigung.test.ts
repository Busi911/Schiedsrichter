import { describe, expect, it } from "vitest";
import {
  rundenspielAenderungenInhalt,
  rundenspielAenderungZeile,
} from "./rundenspiel-benachrichtigung";
import type { RundenspielAenderung } from "./rundenspiel-sync";

const verlegung: RundenspielAenderung = {
  terminId: "t1",
  start: new Date("2026-09-08T18:00:00Z"),
  ort: "Halle 2",
  heimMannschaft: "TV Musterstadt",
  auswaertsMannschaft: "Gastverein",
  verlegt: true,
  ergebnisNeu: false,
  startAlt: new Date("2026-09-01T18:00:00Z"),
  ortAlt: "Halle 1",
  ergebnisHeim: null,
  ergebnisAuswaerts: null,
};

const ergebnis: RundenspielAenderung = {
  ...verlegung,
  verlegt: false,
  ergebnisNeu: true,
  ergebnisHeim: 28,
  ergebnisAuswaerts: 24,
};

describe("rundenspielAenderungZeile", () => {
  it("beschreibt eine Verlegung mit altem und neuem Termin", () => {
    const zeile = rundenspielAenderungZeile(verlegung);
    expect(zeile).toContain("TV Musterstadt – Gastverein");
    expect(zeile).toContain("Halle 1");
    expect(zeile).toContain("Halle 2");
    expect(zeile).toContain("verlegt von");
    expect(zeile).not.toContain("Ergebnis eingetragen");
  });

  it("beschreibt ein neu eingetragenes Ergebnis mit dem Endstand", () => {
    const zeile = rundenspielAenderungZeile(ergebnis);
    expect(zeile).toContain("Ergebnis eingetragen: 28:24");
  });

  it("beschreibt beides, wenn Verlegung und Ergebnis zusammenfallen", () => {
    const zeile = rundenspielAenderungZeile({
      ...verlegung,
      ergebnisNeu: true,
      ergebnisHeim: 28,
      ergebnisAuswaerts: 24,
    });
    expect(zeile).toContain("verlegt von");
    expect(zeile).toContain("Ergebnis eingetragen: 28:24");
  });
});

describe("rundenspielAenderungenInhalt", () => {
  it("verwendet Singular in der Überschrift bei genau einer Änderung", () => {
    const inhalt = rundenspielAenderungenInhalt("Musterverein", [verlegung]);
    expect(inhalt.ueberschrift).toContain("1 Änderung ");
    expect(inhalt.zeilen).toHaveLength(1);
    expect(inhalt.vereinName).toBe("Musterverein");
    expect(inhalt.cta?.url).toContain("/admin/termine?tab=rundenspiele");
  });

  it("verwendet Plural bei mehreren Änderungen", () => {
    const inhalt = rundenspielAenderungenInhalt("Musterverein", [verlegung, ergebnis]);
    expect(inhalt.ueberschrift).toContain("2 Änderungen");
    expect(inhalt.zeilen).toHaveLength(2);
  });
});
