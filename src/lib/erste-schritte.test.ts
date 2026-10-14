import { describe, expect, it } from "vitest";
import { ersteSchritte, ersteSchritteOffen } from "./erste-schritte";

const leer = { spielplanAngebunden: false, mannschaften: 0, funktionstraegerMitRolle: 0, einteilungen: 0 };

describe("ersteSchritte", () => {
  it("neuer Verein: alle Schritte offen, Karte sichtbar", () => {
    const s = ersteSchritte(leer);
    expect(s.map((x) => x.schluessel)).toEqual(["spielplan", "mannschaften", "funktionstraeger", "einteilung"]);
    expect(s.every((x) => !x.erledigt)).toBe(true);
    expect(ersteSchritteOffen(s)).toBe(true);
  });

  it("teilweise eingerichtet: nur die fehlenden Schritte offen", () => {
    const s = ersteSchritte({ ...leer, spielplanAngebunden: true, mannschaften: 4 });
    expect(s.filter((x) => !x.erledigt).map((x) => x.schluessel)).toEqual(["funktionstraeger", "einteilung"]);
    expect(ersteSchritteOffen(s)).toBe(true);
  });

  it("alles erledigt: Karte verschwindet", () => {
    const s = ersteSchritte({ spielplanAngebunden: true, mannschaften: 3, funktionstraegerMitRolle: 10, einteilungen: 1 });
    expect(ersteSchritteOffen(s)).toBe(false);
  });

  it("jeder Schritt verlinkt in den Admin-Bereich und auf einen Hilfe-Abschnitt", () => {
    for (const x of ersteSchritte(leer)) {
      expect(x.href.startsWith("/admin/")).toBe(true);
      expect(x.hilfeAnker).toMatch(/^[a-z-]+$/);
    }
  });
});
