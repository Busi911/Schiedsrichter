import { describe, expect, it } from "vitest";
import { farbtonZuHex, hexZuFarbton } from "./liga-farbe";

describe("hexZuFarbton", () => {
  it("liefert den Farbton kräftiger Farben", () => {
    expect(hexZuFarbton("#ff0000")).toBe(0);
    expect(hexZuFarbton("#00ff00")).toBe(120);
    expect(hexZuFarbton("#0000ff")).toBe(240);
    expect(hexZuFarbton("1d4ed8")).toBe(224);
  });
  it("lehnt Grau/Weiß/Schwarz und Ungültiges ab", () => {
    expect(hexZuFarbton("#808080")).toBeNull();
    expect(hexZuFarbton("#ffffff")).toBeNull();
    expect(hexZuFarbton("#000000")).toBeNull();
    expect(hexZuFarbton("blau")).toBeNull();
    expect(hexZuFarbton("#12345")).toBeNull();
  });
  it("farbtonZuHex ergibt eine Farbe, die denselben Farbton wiedergibt", () => {
    for (const h of [0, 30, 90, 150, 210, 270, 330]) {
      const rueck = hexZuFarbton(farbtonZuHex(h));
      expect(Math.abs((rueck ?? -999) - h)).toBeLessThanOrEqual(2);
    }
  });
});
