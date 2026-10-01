import { describe, expect, it } from "vitest";
import { parseKategorien, passtZumZusatzFilter } from "./zusatzquellen";

const team = (mannschaftsname: string, ligaName: string) => ({ mannschaftsname, ligaName });

describe("Zusatzquellen-Filter", () => {
  it("liest kommagetrennte Kategorien robust", () => {
    expect(parseKategorien("jugend_weiblich, damen,")).toEqual(["jugend_weiblich", "damen"]);
    expect(parseKategorien("")).toEqual([]);
    expect(parseKategorien(null)).toEqual([]);
  });

  it("übernimmt nur Mannschaften der gewählten Kategorie", () => {
    const f = { kategorien: "jugend_weiblich", nameEnthaelt: null };
    expect(passtZumZusatzFilter(team("weibliche Jugend B II", "weibliche B-Jugend Bezirksliga"), f)).toBe(true);
    expect(passtZumZusatzFilter(team("männliche Jugend C", "männliche C-Jugend Bezirksoberliga"), f)).toBe(false);
    expect(passtZumZusatzFilter(team("Männer", "Männer Bezirksoberliga"), f)).toBe(false);
  });

  it("der Namensteil ist zusätzlich (und/und), ohne Groß-/Kleinschreibung", () => {
    const f = { kategorien: "jugend_weiblich", nameEnthaelt: "heuchelheim" };
    expect(passtZumZusatzFilter(team("weibliche Jugend B II", "wJSG Bieber/Heuchelheim Liga"), f)).toBe(true);
    expect(passtZumZusatzFilter(team("weibliche Jugend A", "weibliche A-Jugend Bezirksliga"), f)).toBe(false);
  });

  it("ohne Kategorie nur über den Namensteil; ganz ohne Filter wird alles Reguläre genommen", () => {
    expect(passtZumZusatzFilter(team("Männer", "Männer Liga X"), { kategorien: "", nameEnthaelt: "liga x" })).toBe(true);
    expect(passtZumZusatzFilter(team("Männer", "Männer Liga X"), { kategorien: "", nameEnthaelt: null })).toBe(true);
  });

  it("entfallene Mannschaften werden nie übernommen", () => {
    expect(
      passtZumZusatzFilter(team("entfällt: Jugend F - Maxi 2x3gg3", "Meldeliste"), { kategorien: "", nameEnthaelt: null })
    ).toBe(false);
  });
});
