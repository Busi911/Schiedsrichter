import { describe, expect, it } from "vitest";
import { terminAlsCsv } from "./termin-auswertung";

const basisZeile = {
  id: "t1",
  typ: "testspiel" as const,
  start: new Date("2026-05-01T18:30:00"),
  ende: null,
  ort: "Sporthalle",
  beschreibung: "gegen TuS Musterstadt",
  mannschaftName: "Herren 1",
  schiedsrichterName: null,
  schiedsrichterEmail: null,
};

describe("terminAlsCsv", () => {
  it("enthält Kopfzeile und formatierte Datenzeile", () => {
    const csv = terminAlsCsv([basisZeile]);
    const zeilen = csv.replace(/^﻿/, "").split("\n");

    expect(zeilen[0]).toBe(
      "Datum;Uhrzeit;Typ;Ort;Beschreibung;Mannschaft;Schiedsrichter;Schiedsrichter-E-Mail"
    );
    expect(zeilen[1]).toContain("testspiel");
    expect(zeilen[1]).toContain("Sporthalle");
    expect(zeilen[1]).toContain("Herren 1");
  });

  it("escaped Beschreibungen mit Semikolon", () => {
    const csv = terminAlsCsv([
      { ...basisZeile, beschreibung: "Heim; Auswärts getauscht" },
    ]);
    expect(csv).toContain('"Heim; Auswärts getauscht"');
  });

  it("liefert nur die Kopfzeile bei leerer Liste", () => {
    const csv = terminAlsCsv([]);
    expect(csv.replace(/^﻿/, "").split("\n")).toHaveLength(1);
  });
});
