import { describe, expect, it } from "vitest";
import { filtereNachAnsicht, hallenOptionen, hallenSchluessel, inEigenerHalle, mannschaftsOptionen } from "./rundenspiel-filter";

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
    { id: 1, eigeneHalle: true, mannschaftId: "m-je", ort: "Sporthalle Dutenhofen" },
    { id: 2, eigeneHalle: false, mannschaftId: "m-ja", ort: "Arena Leipzig" },
    { id: 3, eigeneHalle: null, mannschaftId: "m-wje", ort: null },
    { id: 4, eigeneHalle: true, mannschaftId: "m-je", ort: "SPORTHALLE DUTENHOFEN" },
  ];
  const f = (ansicht: "alle" | "eigene" | "auswaerts", mannschaftId = "", halle = "") =>
    filtereNachAnsicht(liste, { ansicht, mannschaftId, halle }).map((t) => t.id);
  it("Alle zeigt alles, auch nicht Entscheidbares", () => expect(f("alle")).toEqual([1, 2, 3, 4]));
  it("Eigene Hallen zeigt nur sicher eigene", () => expect(f("eigene")).toEqual([1, 4]));
  it("Auswärts zeigt nur sicher fremde", () => expect(f("auswaerts")).toEqual([2]));
  it("Mannschaftsfilter wirkt über die stabile ID, nicht über den Namen", () => {
    expect(f("alle", "m-ja")).toEqual([2]);
    expect(f("alle", "m-je")).toEqual([1, 4]);
    expect(f("eigene", "m-ja")).toEqual([]);
  });
  it("Hallenfilter fasst Schreibvarianten (Groß-/Kleinschreibung) zusammen", () => {
    expect(f("alle", "", hallenSchluessel("Sporthalle Dutenhofen"))).toEqual([1, 4]);
    expect(f("alle", "", hallenSchluessel("SPORTHALLE DUTENHOFEN"))).toEqual([1, 4]);
  });
});

describe("hallenOptionen", () => {
  it("eine Auswahl je Hallenidentität, mit der schönsten Schreibweise", () => {
    const o = hallenOptionen(["SPORTHALLE DUTENHOFEN", "Sporthalle Dutenhofen", "SPORTHALLE DUTENHOFEN", "Arena Leipzig", null, " "]);
    expect(o.map((x) => x.label)).toEqual(["Arena Leipzig", "Sporthalle Dutenhofen"]);
  });
  it("bei nur einer (großgeschriebenen) Variante bleibt diese", () => {
    expect(hallenOptionen(["SPORTHALLE DUTENHOFEN"])).toEqual([{ schluessel: hallenSchluessel("Sporthalle Dutenhofen"), label: "SPORTHALLE DUTENHOFEN" }]);
  });
});

describe("mannschaftsOptionen", () => {
  it("je ID ein Eintrag, nach Bezeichnung sortiert", () => {
    expect(mannschaftsOptionen([{ id: "b", label: "mJA" }, { id: "a", label: "wJE" }, { id: "b", label: "mJA" }])).toEqual([
      { id: "b", label: "mJA" },
      { id: "a", label: "wJE" },
    ]);
  });
  it("gleiche Bezeichnungen bleiben unterscheidbar (durchnummeriert) und führen zu verschiedenen IDs", () => {
    const o = mannschaftsOptionen([
      { id: "x", label: "HSG (MJE)" },
      { id: "y", label: "HSG (MJE)" },
    ]);
    expect(o.map((m) => m.id).sort()).toEqual(["x", "y"]);
    expect(o.map((m) => m.label)).toEqual(["HSG (MJE) (1)", "HSG (MJE) (2)"]);
  });
});
