import { describe, expect, it } from "vitest";
import { sortiereVereine, sortierName } from "./vereinsliste";

describe("Vereinsliste sortieren", () => {
  it("nach Ortsnamen, nicht nach HSG/TSF/TSG", () => {
    const namen = ["HSG Kirchhain/Neustadt", "TSG Leihgestern", "HSG Dutenhofen/Münchholzhausen", "TSF Heuchelheim"].map((name) => ({ name }));
    expect(sortiereVereine(namen).map((v) => v.name)).toEqual([
      "HSG Dutenhofen/Münchholzhausen",
      "TSF Heuchelheim",
      "HSG Kirchhain/Neustadt",
      "TSG Leihgestern",
    ]);
  });
  it("Kürzel mit Kleinbuchstaben, mehrere Präfixe und normale Wörter", () => {
    expect(sortierName("TuS Griesheim")).toBe("Griesheim");
    expect(sortierName("VfL Gummersbach")).toBe("Gummersbach");
    expect(sortierName("JSG HSG Linden")).toBe("Linden");
    expect(sortierName("Rhein Main Handball")).toBe("Rhein Main Handball");
    expect(sortierName("HSG")).toBe("HSG");
  });
  it("verändert die Eingabe nicht", () => {
    const eingabe = [{ name: "B" }, { name: "A" }];
    sortiereVereine(eingabe);
    expect(eingabe[0].name).toBe("B");
  });
});
