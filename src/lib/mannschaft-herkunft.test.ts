import { describe, expect, it } from "vitest";
import { findeGleichBezeichnete, herkunftText, unterscheidbarerName } from "./mannschaft-herkunft";

describe("herkunftText", () => {
  it("nennt Liga, Saison und Quelle", () => {
    expect(herkunftText({ liga: "Kreisliga A", saison: "2026/27", quelle: "nuliga" })).toBe("Kreisliga A · Saison 2026/27 · nuLiga");
    expect(herkunftText({ liga: null, saison: "2026/27", quelle: "handball_net" })).toBe("Saison 2026/27 · handball.net");
  });
  it("ohne Verknüpfung: von Hand angelegt", () => {
    expect(herkunftText(undefined)).toContain("von Hand angelegt");
    expect(herkunftText({ liga: null, saison: null, quelle: null })).toContain("von Hand angelegt");
  });
});

describe("findeGleichBezeichnete", () => {
  const liste = [
    { id: "a", name: "HSG Dutenh./Münchholzh.", altersklasse: "MJE" },
    { id: "b", name: "HSG Dutenh./Münchholzh. ", altersklasse: "mje" },
    { id: "c", name: "HSG Dutenh./Münchholzh.", altersklasse: "WJE" },
    { id: "d", name: "HSG Dutenh./Münchholzh.", altersklasse: null },
  ];
  it("gleicher Name und gleiche Altersklasse (ohne Groß-/Kleinschreibung und Leerzeichen)", () => {
    expect([...findeGleichBezeichnete(liste)].sort()).toEqual(["a", "b"]);
  });
  it("verschiedene Altersklassen sind nicht gleich", () => {
    expect(findeGleichBezeichnete(liste.slice(2)).size).toBe(0);
  });
});

describe("unterscheidbarerName", () => {
  const m = { name: "HSG Dutenh./Münchholzh.", altersklasse: "MJE" };
  it("eindeutige Mannschaft: unverändert", () => {
    expect(unterscheidbarerName(m, false, { liga: "Bezirksliga", saison: null, quelle: "nuliga" })).toBe("HSG Dutenh./Münchholzh. (MJE)");
  });
  it("gleich bezeichnet: Liga als Zusatz", () => {
    expect(unterscheidbarerName(m, true, { liga: "Bezirksoberliga", saison: "2026/27", quelle: "nuliga" })).toBe("HSG Dutenh./Münchholzh. (MJE) – Bezirksoberliga");
  });
  it("gleich bezeichnet, aber ohne Liga-Angabe: nur die Quelle, sonst unverändert", () => {
    expect(unterscheidbarerName(m, true, { liga: null, saison: null, quelle: "handball_net" })).toBe("HSG Dutenh./Münchholzh. (MJE) – handball.net");
    expect(unterscheidbarerName(m, true, undefined)).toBe("HSG Dutenh./Münchholzh. (MJE)");
  });
});
