import { describe, expect, it } from "vitest";
import { eindeutigeWerte, filtereNachAnsicht, inEigenerHalle } from "./rundenspiel-filter";

describe("inEigenerHalle", () => {
  it("erkennt eine eigene Halle am Namen (Teilstring, ohne Groß-/Kleinschreibung)", () => {
    expect(inEigenerHalle("Sporthalle Dutenhofen (Halle 1)", "Sporthalle Dutenhofen")).toBe(true);
  });
  it("fremde Halle: false", () => {
    expect(inEigenerHalle("Arena Leipzig", "Sporthalle Dutenhofen; Mehrzweckhalle Münchholzhausen")).toBe(false);
  });
  it("nicht entscheidbar ohne eingetragene Hallen oder ohne Ort: null", () => {
    expect(inEigenerHalle("Arena Leipzig", null)).toBeNull();
    expect(inEigenerHalle(null, "Sporthalle Dutenhofen")).toBeNull();
  });
});

describe("filtereNachAnsicht", () => {
  const liste = [
    { id: 1, eigeneHalle: true, mannschaftName: "mJE", ort: "Sporthalle Dutenhofen" },
    { id: 2, eigeneHalle: false, mannschaftName: "mJA", ort: "Arena Leipzig" },
    { id: 3, eigeneHalle: null, mannschaftName: "wJE", ort: null },
  ];
  const f = (ansicht: "alle" | "eigene" | "auswaerts", mannschaft = "", halle = "") => filtereNachAnsicht(liste, { ansicht, mannschaft, halle }).map((t) => t.id);
  it("Alle zeigt alles, auch nicht Entscheidbares", () => expect(f("alle")).toEqual([1, 2, 3]));
  it("Eigene Hallen zeigt nur sicher eigene", () => expect(f("eigene")).toEqual([1]));
  it("Auswärts zeigt nur sicher fremde", () => expect(f("auswaerts")).toEqual([2]));
  it("Mannschafts- und Hallenfilter wirken zusätzlich", () => {
    expect(f("alle", "mJA")).toEqual([2]);
    expect(f("alle", "", "Sporthalle Dutenhofen")).toEqual([1]);
    expect(f("eigene", "mJA")).toEqual([]);
  });
});

describe("eindeutigeWerte", () => {
  it("entfernt Leere und Doppelte und sortiert", () => {
    expect(eindeutigeWerte(["b", " a ", null, "b", "", undefined])).toEqual(["a", "b"]);
  });
});
