import { describe, expect, it } from "vitest";
import { baueOeffentlicheTrainings, oeffentlicheGruppe } from "./training-oeffentlich";

// Donnerstag, 22.10.2026, 12:00 deutsche Zeit
const JETZT = new Date("2026-10-22T10:00:00Z");
const zeit = (id: string, mannschaftId: string, halleId: string, wochentag: number, von: number, bis: number) => ({
  id,
  mannschaftId,
  halleId,
  wochentag,
  startMinuten: von,
  endMinuten: bis,
  abteilNummer: null,
  farbe: "#000",
});
const halle = (id: string, name: string, saison: { von: number | null; bis: number | null } = { von: null, bis: null }) => ({
  id,
  name,
  abteilAnzahl: 0,
  abteil1Name: null,
  abteil2Name: null,
  abteil3Name: null,
  abteil4Name: null,
  saisonVonMonat: saison.von,
  saisonBisMonat: saison.bis,
});

describe("oeffentlicheGruppe", () => {
  it("nimmt bevorzugt die Kategorie der Liga-Mannschaft", () => {
    expect(oeffentlicheGruppe({ name: "HSG", altersklasse: null }, "damen")).toBe("damen");
    expect(oeffentlicheGruppe({ name: "HSG", altersklasse: null }, "jugend_weiblich")).toBe("jugend");
    expect(oeffentlicheGruppe({ name: "HSG", altersklasse: null }, "mini")).toBe("jugend"); // unbekannte Kategorie -> aus dem Namen -> unbekannt -> Jugend
  });
  it("ohne Liga-Verknüpfung aus Name und Altersklasse", () => {
    expect(oeffentlicheGruppe({ name: "1. Herren", altersklasse: null }, null)).toBe("herren");
    expect(oeffentlicheGruppe({ name: "1. Damen", altersklasse: null }, undefined)).toBe("damen");
    expect(oeffentlicheGruppe({ name: "männliche B-Jugend", altersklasse: null }, null)).toBe("jugend");
    expect(oeffentlicheGruppe({ name: "Minis", altersklasse: null }, null)).toBe("kinder");
    expect(oeffentlicheGruppe({ name: "Irgendwas", altersklasse: null }, null)).toBe("jugend");
  });
});

describe("baueOeffentlicheTrainings", () => {
  const mannschaften = [
    { id: "m1", name: "1. Herren", altersklasse: "Mä", ligaMannschaftId: "lm1" },
    { id: "m2", name: "Minis", altersklasse: null, ligaMannschaftId: null },
  ];
  const basis = {
    mannschaften,
    hallen: [halle("h1", "Sporthalle"), halle("beach", "Beachplatz", { von: 5, bis: 9 })],
    ligaKategorien: new Map([["lm1", "herren"]]),
    jetzt: JETZT,
    tage: 8,
  };

  it("macht aus dem Plan datierte Einträge mit Mannschaft, Ort, Gruppe und Favoriten-Verweis", () => {
    const l = baueOeffentlicheTrainings({ ...basis, zeiten: [zeit("a", "m1", "h1", 3, 18 * 60, 19 * 60 + 30)], ausfaelle: [] });
    expect(l).toHaveLength(2); // heute 18:00 und nächsten Donnerstag
    expect(l[0]).toEqual({
      id: "a|2026-10-22",
      datum: "2026-10-22",
      startMinuten: 1080,
      endMinuten: 1170,
      mannschaft: "1. Herren (Mä)",
      ligaMannschaftId: "lm1",
      gruppe: "herren",
      ort: "Sporthalle",
      ausgefallen: false,
    });
  });

  it("zeigt Ausfälle ohne Grund; der Grund taucht nirgends im Ergebnis auf", () => {
    const l = baueOeffentlicheTrainings({
      ...basis,
      zeiten: [zeit("a", "m1", "h1", 3, 18 * 60, 19 * 60)],
      ausfaelle: [{ trainingszeitId: "a", datum: "2026-10-22", grund: "Trainer krank (intern)" }],
    });
    expect(l[0].ausgefallen).toBe(true);
    expect(JSON.stringify(l)).not.toContain("krank");
    expect(Object.keys(l[0]).sort()).toEqual(["ausgefallen", "datum", "endMinuten", "gruppe", "id", "ligaMannschaftId", "mannschaft", "ort", "startMinuten"]);
  });

  it("Trainings an einem Ort außerhalb der Saison fehlen", () => {
    const l = baueOeffentlicheTrainings({ ...basis, zeiten: [zeit("b", "m2", "beach", 3, 10 * 60, 11 * 60), zeit("a", "m1", "h1", 3, 18 * 60, 19 * 60)], ausfaelle: [] });
    expect(l.map((t) => t.id.split("|")[0])).toEqual(["a", "a"]);
  });

  it("Zeiten unbekannter Mannschaften werden übersprungen", () => {
    expect(baueOeffentlicheTrainings({ ...basis, zeiten: [zeit("x", "fremd", "h1", 3, 18 * 60, 19 * 60)], ausfaelle: [] })).toEqual([]);
  });
});
