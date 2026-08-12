import { describe, expect, it } from "vitest";
import { formatErgebnis, rundenspielTypLabel } from "./termin-label";

describe("rundenspielTypLabel", () => {
  it("zeigt Ligaspiel für Pflichtspiele", () => {
    expect(rundenspielTypLabel(true)).toBe("Ligaspiel");
  });

  it("zeigt Freundschaftsspiel/Turnier für Nicht-Pflichtspiele und unbekannt", () => {
    expect(rundenspielTypLabel(false)).toBe("Freundschaftsspiel/Turnier");
    expect(rundenspielTypLabel(null)).toBe("Freundschaftsspiel/Turnier");
    expect(rundenspielTypLabel(undefined)).toBe("Freundschaftsspiel/Turnier");
  });
});

describe("formatErgebnis", () => {
  it("formatiert als 'Heim:Auswärts', wenn beide Werte gesetzt sind", () => {
    expect(formatErgebnis(24, 20)).toBe("24:20");
    expect(formatErgebnis(0, 0)).toBe("0:0");
  });

  it("liefert null, wenn einer oder beide Werte fehlen", () => {
    expect(formatErgebnis(null, null)).toBeNull();
    expect(formatErgebnis(24, null)).toBeNull();
    expect(formatErgebnis(null, 20)).toBeNull();
    expect(formatErgebnis(undefined, undefined)).toBeNull();
  });
});
