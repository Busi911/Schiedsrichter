import { describe, expect, it } from "vitest";
import { formatMannschaft, lesbareKategorie } from "./mannschaft-label";

describe("lesbareKategorie", () => {
  it("übersetzt nuLiga-Kürzel", () => {
    expect(lesbareKategorie("M")).toBe("Männer");
    expect(lesbareKategorie("F")).toBe("Frauen");
    expect(lesbareKategorie("MJE")).toBe("männliche E-Jugend");
    expect(lesbareKategorie("WJD")).toBe("weibliche D-Jugend");
  });
  it("lässt Unbekanntes unverändert", () => {
    expect(lesbareKategorie("gemischte Minis")).toBe("gemischte Minis");
  });
  it("formatMannschaft nutzt es nur im kategorie-Rückfall", () => {
    expect(formatMannschaft({ kategorie: "MJC" })).toBe("männliche C-Jugend");
    expect(formatMannschaft({ mannschaftName: "Herren 1", mannschaftAltersklasse: "MJC", kategorie: "M" })).toBe(
      "Herren 1 (MJC)"
    );
  });
});
