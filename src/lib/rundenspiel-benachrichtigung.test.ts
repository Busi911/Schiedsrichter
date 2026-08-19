import { describe, expect, it } from "vitest";
import {
  rundenspielAenderungenInhalt,
  rundenspielAenderungZeile,
} from "./rundenspiel-benachrichtigung";
import type { RundenspielAenderung } from "./rundenspiel-sync";

const verlegung: RundenspielAenderung = {
  terminId: "t1",
  start: new Date("2026-09-01T18:00:00Z"),
  ort: "Halle 1",
  heimMannschaft: "TV Musterstadt",
  auswaertsMannschaft: "Gastverein",
  verlegt: true,
  ergebnisNeu: false,
};

const ergebnis: RundenspielAenderung = {
  ...verlegung,
  verlegt: false,
  ergebnisNeu: true,
};

describe("rundenspielAenderungZeile", () => {
  it("beschreibt eine Verlegung", () => {
    const zeile = rundenspielAenderungZeile(verlegung);
    expect(zeile).toContain("TV Musterstadt – Gastverein");
    expect(zeile).toContain("Halle 1");
    expect(zeile).toContain("verlegt");
    expect(zeile).not.toContain("Ergebnis eingetragen");
  });

  it("beschreibt ein neu eingetragenes Ergebnis", () => {
    const zeile = rundenspielAenderungZeile(ergebnis);
    expect(zeile).toContain("Ergebnis eingetragen");
  });

  it("beschreibt beides, wenn Verlegung und Ergebnis zusammenfallen", () => {
    const zeile = rundenspielAenderungZeile({ ...verlegung, ergebnisNeu: true });
    expect(zeile).toContain("verlegt, Ergebnis eingetragen");
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
