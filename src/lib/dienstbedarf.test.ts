import { describe, expect, it } from "vitest";
import { hatDienstbedarf, VEREIN_BEDARF_FELDER, type VereinBedarfWerte } from "./dienstbedarf";

const leer = Object.fromEntries(VEREIN_BEDARF_FELDER.map((f) => [f, 0])) as VereinBedarfWerte;
const dienst = { aktiv: true, bedarfHeim: 0, bedarfAuswaerts: 0, bedarfFreundschaft: 0, bedarfTurnier: 0 };

describe("hatDienstbedarf", () => {
  it("alles auf 0 und keine eigenen Dienste: kein Bedarf eingerichtet", () => {
    expect(hatDienstbedarf(leer, [])).toBe(false);
    expect(hatDienstbedarf(null)).toBe(false);
  });
  it("ein fester Dienst mit Bedarf genügt", () => {
    expect(hatDienstbedarf({ ...leer, rundenspielZeitnehmerBedarf: 1 })).toBe(true);
    expect(hatDienstbedarf({ ...leer, turnierKassiererBedarf: 2 })).toBe(true);
  });
  it("ein aktiver eigener Dienst mit Bedarf zählt, ein deaktivierter oder bedarfsloser nicht", () => {
    expect(hatDienstbedarf(leer, [{ ...dienst, bedarfAuswaerts: 2 }])).toBe(true);
    expect(hatDienstbedarf(leer, [{ ...dienst, aktiv: false, bedarfHeim: 2 }])).toBe(false);
    expect(hatDienstbedarf(leer, [dienst])).toBe(false);
  });
});
