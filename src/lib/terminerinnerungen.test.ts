import { describe, expect, it } from "vitest";
import { erinnerungsMailInhalt } from "./terminerinnerungen";

describe("erinnerungsMailInhalt", () => {
  it("enthält Zeitpunkt, Ort und Beschreibung, wenn vorhanden", () => {
    const inhalt = erinnerungsMailInhalt({
      start: new Date("2026-09-01T18:00:00+02:00"),
      ort: "Halle 1",
      beschreibung: "Herren 1 vs. Herren 2",
    });
    expect(inhalt.zeilen).toContainEqual(expect.stringContaining("Halle 1"));
    expect(inhalt.zeilen).toContain("Herren 1 vs. Herren 2");
  });

  it("lässt Ort/Beschreibung weg, wenn nicht gesetzt", () => {
    const inhalt = erinnerungsMailInhalt({
      start: new Date("2026-09-01T18:00:00+02:00"),
      ort: null,
      beschreibung: null,
    });
    expect(inhalt.zeilen).toHaveLength(1);
  });
});
