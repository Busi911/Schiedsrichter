import { describe, expect, it } from "vitest";
import { einrichtungsPunkte, lebenszeichen, type VereinsKennzahlen } from "./verein-gesundheit-bewertung";

const jetzt = new Date("2026-10-05T12:00:00Z");
const tage = (n: number) => new Date(jetzt.getTime() - n * 24 * 60 * 60 * 1000);

describe("lebenszeichen", () => {
  it("lebt bis 7 Tage, ruhig bis 30, danach inaktiv, ohne Aktivität nie", () => {
    expect(lebenszeichen(tage(1), jetzt)).toBe("lebt");
    expect(lebenszeichen(tage(7), jetzt)).toBe("lebt");
    expect(lebenszeichen(tage(8), jetzt)).toBe("ruhig");
    expect(lebenszeichen(tage(30), jetzt)).toBe("ruhig");
    expect(lebenszeichen(tage(31), jetzt)).toBe("inaktiv");
    expect(lebenszeichen(null, jetzt)).toBe("nie");
  });
});

describe("einrichtungsPunkte", () => {
  const leer: VereinsKennzahlen = {
    personen: 0, admins: 0, mitRolle: 0, angemeldet: 0, adminAngemeldet: false, avvAkzeptiert: false,
    mannschaften: 0, kuenftigeTermine: 0, zuordnungen30Tage: 0, oeffentlicheSeite: false,
    letzteAktivitaet: null, onlineJetzt: 0,
  };
  it("ein leerer Verein erfüllt nichts", () => {
    expect(einrichtungsPunkte(leer).filter((p) => p.erfuellt)).toHaveLength(0);
  });
  it("erkennt jeden erfüllten Punkt einzeln", () => {
    const voll = einrichtungsPunkte({
      ...leer, admins: 1, adminAngemeldet: true, avvAkzeptiert: true, mannschaften: 3, mitRolle: 5,
      kuenftigeTermine: 8, oeffentlicheSeite: true,
    });
    expect(voll.every((p) => p.erfuellt)).toBe(true);
    const nurAdmin = einrichtungsPunkte({ ...leer, admins: 1 });
    expect(nurAdmin.filter((p) => p.erfuellt).map((p) => p.schluessel)).toEqual(["admin"]);
  });
});

import { vorZeit } from "./verein-gesundheit-bewertung";
describe("vorZeit", () => {
  const min = (n: number) => new Date(jetzt.getTime() - n * 60000);
  it("formatiert Minuten, Stunden, Tage und nie", () => {
    expect(vorZeit(null, jetzt)).toBe("nie");
    expect(vorZeit(min(0), jetzt)).toBe("gerade eben");
    expect(vorZeit(min(12), jetzt)).toBe("vor 12 Min.");
    expect(vorZeit(min(180), jetzt)).toBe("vor 3 Std.");
    expect(vorZeit(min(24 * 60), jetzt)).toBe("vor 1 Tag");
    expect(vorZeit(min(5 * 24 * 60), jetzt)).toBe("vor 5 Tagen");
  });
});
