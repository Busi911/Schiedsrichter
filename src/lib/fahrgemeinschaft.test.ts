import { describe, expect, it } from "vitest";
import {
  fahrtenUebersicht,
  fahrtText,
  freiePlaetze,
  mitfahrerMoeglich,
  oeffentlicherFahrtText,
  pruefeFahrtHinweis,
  pruefeMitfahrerName,
  pruefePlaetze,
} from "./fahrgemeinschaft";

describe("Eingaben", () => {
  it("Plätze: leer = keine Angabe, 0 bis 8, sonst Fehler", () => {
    expect(pruefePlaetze("")).toBeNull();
    expect(pruefePlaetze(" 3 ")).toBe(3);
    expect(pruefePlaetze("0")).toBe(0);
    expect(() => pruefePlaetze("9")).toThrow();
    expect(() => pruefePlaetze("2.5")).toThrow();
    expect(() => pruefePlaetze("-1")).toThrow();
  });
  it("Hinweis und Mitfahrername werden bereinigt", () => {
    expect(pruefeFahrtHinweis("  Treffpunkt   Halle ")).toBe("Treffpunkt Halle");
    expect(pruefeFahrtHinweis("   ")).toBeNull();
    expect(pruefeMitfahrerName(" Lena  M. ")).toBe("Lena M.");
    expect(() => pruefeMitfahrerName(" ")).toThrow();
    expect(() => pruefeMitfahrerName("x".repeat(61))).toThrow();
  });
});

describe("Plätze", () => {
  it("Mitfahrer nur bis zur angegebenen Zahl, ohne Angabe gar nicht", () => {
    expect(mitfahrerMoeglich({ plaetze: 2, mitfahrer: ["A"] })).toBe(true);
    expect(mitfahrerMoeglich({ plaetze: 2, mitfahrer: ["A", "B"] })).toBe(false);
    expect(mitfahrerMoeglich({ plaetze: null, mitfahrer: [] })).toBe(false);
    expect(freiePlaetze({ plaetze: 1, mitfahrer: ["A", "B"] })).toBe(0);
  });
  it("Übersicht je Termin und Texte", () => {
    const fahrten = [
      { plaetze: 3, mitfahrer: ["A"] },
      { plaetze: 2, mitfahrer: ["B", "C"] },
      { plaetze: null, mitfahrer: [] },
    ];
    expect(fahrtenUebersicht(fahrten)).toEqual({ plaetze: 5, belegt: 3, frei: 2, ohneAngabe: 1 });
    expect(oeffentlicherFahrtText(fahrten)).toBe("Mitfahrplätze frei: 2");
    expect(oeffentlicherFahrtText([{ plaetze: 1, mitfahrer: ["A"] }])).toBe("Mitfahrplätze: alle belegt");
    expect(oeffentlicherFahrtText([{ plaetze: null, mitfahrer: [] }])).toBeNull();
    expect(fahrtText({ plaetze: 3, mitfahrer: ["A"], hinweis: "Treffpunkt Halle 13:15" })).toBe("3 Plätze, 2 frei · Treffpunkt Halle 13:15");
    expect(fahrtText({ plaetze: 1, mitfahrer: [] })).toBe("1 Platz, 1 frei");
    expect(fahrtText({ plaetze: null, mitfahrer: [] })).toBe("Plätze noch nicht angegeben");
  });
});
