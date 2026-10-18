import { describe, expect, it } from "vitest";
import { istAehnlicherName, kernwoerter, normalisiereVereinsname, zustandText } from "./verein-duplikat";

describe("normalisiereVereinsname", () => {
  it("macht Umlaute, Satzzeichen und Groß-/Kleinschreibung gleich", () => {
    expect(normalisiereVereinsname("HSG Dutenhofen/Münchholzhausen e.V.")).toEqual([
      "hsg", "dutenhofen", "muenchholzhausen", "e", "v",
    ]);
  });
});

describe("kernwoerter", () => {
  it("lässt Rechtsform und Vereinsart weg", () => {
    expect([...kernwoerter("HSG Dutenhofen/Münchholzhausen e.V.")].sort()).toEqual(["dutenhofen", "muenchholzhausen"]);
  });
});

describe("istAehnlicherName", () => {
  it("gleicher Name und Schreibvarianten treffen", () => {
    expect(istAehnlicherName("TSG Leihgestern", "tsg leihgestern e.V.")).toBe(true);
    expect(istAehnlicherName("Handballverein Münchholzhausen", "HV Muenchholzhausen e.V.")).toBe(true);
    // Tippfehler im Namen werden bewusst NICHT erraten (kein Treffer, der Verein wird normal angelegt).
    expect(istAehnlicherName("HSG Dutenhofn", "HSG Dutenhofen")).toBe(false);
  });
  it("ein Teil des längeren Namens trifft (Spielgemeinschaft)", () => {
    expect(istAehnlicherName("HSG Dutenhofen", "HSG Dutenhofen/Münchholzhausen")).toBe(true);
    expect(istAehnlicherName("Dutenhofen Münchholzhausen", "HSG Dutenhofen/Münchholzhausen")).toBe(true);
  });
  it("verschiedene Vereine treffen nicht", () => {
    expect(istAehnlicherName("TSG Leihgestern", "TSG Münster")).toBe(false);
    expect(istAehnlicherName("HSG Linden", "HSG Heuchelheim")).toBe(false);
  });
  it("ein Name nur aus Füllwörtern trifft nie", () => {
    expect(istAehnlicherName("SG", "SG Wetzlar")).toBe(false);
    expect(istAehnlicherName("HSG", "HSG")).toBe(false);
  });
});

describe("zustandText", () => {
  it("benennt die drei Zustände", () => {
    expect(zustandText("aktiv")).toBe("aktiv");
    expect(zustandText("vorbereitung")).toBe("in Vorbereitung");
    expect(zustandText("inaktiv")).toBe("inaktiv");
  });
});
