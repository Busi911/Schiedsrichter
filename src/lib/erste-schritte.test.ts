import { describe, expect, it } from "vitest";
import { ersteSchritte, ersteSchritteOffen, ersteSchritteZaehlung } from "./erste-schritte";

const leer = { spielplanAngebunden: false, spielhallen: false, mannschaften: 0, funktionstraegerMitRolle: 0, einteilungen: 0 };

describe("ersteSchritte", () => {
  it("neuer Verein: alle Schritte offen, Karte sichtbar", () => {
    const s = ersteSchritte(leer);
    expect(s.map((x) => x.schluessel)).toEqual(["spielplan", "spielhallen", "mannschaften", "funktionstraeger", "einteilung"]);
    expect(s.every((x) => !x.erledigt)).toBe(true);
    expect(ersteSchritteOffen(s)).toBe(true);
  });

  it("teilweise eingerichtet: nur die fehlenden Schritte offen", () => {
    const s = ersteSchritte({ ...leer, spielplanAngebunden: true, mannschaften: 4 });
    expect(s.filter((x) => !x.erledigt).map((x) => x.schluessel)).toEqual(["spielhallen", "funktionstraeger", "einteilung"]);
    expect(ersteSchritteOffen(s)).toBe(true);
  });

  it("alles erledigt: Karte verschwindet", () => {
    const s = ersteSchritte({ spielplanAngebunden: true, spielhallen: true, mannschaften: 3, funktionstraegerMitRolle: 10, einteilungen: 1 });
    expect(ersteSchritteOffen(s)).toBe(false);
  });

  it("Spielplan ohne Spielhallen ist nicht fertig (sonst kommen keine Heimspiele)", () => {
    const s = ersteSchritte({ spielplanAngebunden: true, spielhallen: false, mannschaften: 3, funktionstraegerMitRolle: 5, einteilungen: 1 });
    expect(ersteSchritteOffen(s)).toBe(true);
    expect(s.find((x) => x.schluessel === "spielhallen")?.erledigt).toBe(false);
  });

  it("jeder Schritt verlinkt in den Admin-Bereich und auf einen Hilfe-Abschnitt", () => {
    for (const x of ersteSchritte(leer)) {
      expect(x.href.startsWith("/admin/")).toBe(true);
      expect(x.hilfeAnker).toMatch(/^[a-z-]+$/);
    }
  });

  it("von Hand eingerichtet (ohne Spielplan-Anbindung): Karte verschwindet, Spielplan/Spielhallen sind nur optional", () => {
    const s = ersteSchritte({ spielplanAngebunden: false, spielhallen: false, mannschaften: 2, funktionstraegerMitRolle: 3, einteilungen: 1 });
    expect(ersteSchritteOffen(s)).toBe(false);
    expect(s.find((x) => x.schluessel === "spielplan")?.optional).toBe(true);
    expect(s.find((x) => x.schluessel === "spielhallen")?.optional).toBe(true);
    expect(ersteSchritteZaehlung(s)).toEqual({ erledigt: 3, gesamt: 3 });
  });

  it("mit Spielplan-Anbindung sind die Spielhallen Pflicht und zählen mit", () => {
    const s = ersteSchritte({ ...leer, spielplanAngebunden: true });
    expect(s.find((x) => x.schluessel === "spielhallen")?.optional).toBe(false);
    expect(ersteSchritteZaehlung(s)).toEqual({ erledigt: 0, gesamt: 4 });
  });

  it("neuer Verein: Zählung nur über die nötigen Schritte (ohne Anbindung 3)", () => {
    expect(ersteSchritteZaehlung(ersteSchritte(leer))).toEqual({ erledigt: 0, gesamt: 3 });
  });

  it("der Spielhallen-Text behauptet ohne Anbindung nicht, dass nichts einzuteilen sei", () => {
    const text = ersteSchritte(leer).find((x) => x.schluessel === "spielhallen")!.text;
    expect(text).not.toContain("nichts einzuteilen");
    expect(text).toContain("Von Hand angelegte Termine brauchen das nicht");
  });
});
