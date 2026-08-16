import { describe, expect, it } from "vitest";
import { ermittleRundenspielAenderung, terminBenoetigtUpdate } from "./rundenspiel-sync";
import type { RundenspielEreignis } from "./rundenspiel-import";

const ereignis: RundenspielEreignis = {
  uid: "u1",
  start: new Date("2026-09-01T18:00:00+02:00"),
  ort: "Halle 1",
  beschreibung: "TV Musterstadt - Gastverein",
  heimMannschaft: "TV Musterstadt",
  auswaertsMannschaft: "Gastverein",
  kategorie: "mJC",
  pflichtspiel: true,
  freundschaftsTyp: null,
  ergebnisHeim: null,
  ergebnisAuswaerts: null,
  schiedsrichterKuerzel: null,
};

const bestehend = {
  start: ereignis.start,
  ort: ereignis.ort,
  beschreibung: ereignis.beschreibung,
  mannschaftId: "m1",
  heimMannschaftName: ereignis.heimMannschaft,
  auswaertsMannschaftName: ereignis.auswaertsMannschaft,
  kategorie: ereignis.kategorie,
  pflichtspiel: ereignis.pflichtspiel,
  freundschaftsTyp: ereignis.freundschaftsTyp,
  ergebnisHeim: ereignis.ergebnisHeim,
  ergebnisAuswaerts: ereignis.ergebnisAuswaerts,
  nuligaSchiedsrichterKuerzel: ereignis.schiedsrichterKuerzel,
};

describe("terminBenoetigtUpdate", () => {
  it("meldet kein Update, wenn sich nichts geändert hat", () => {
    expect(terminBenoetigtUpdate(bestehend, ereignis, "m1")).toBe(false);
  });

  it("meldet ein Update, wenn sich die Startzeit geändert hat", () => {
    const geaendert = { ...ereignis, start: new Date("2026-09-02T18:00:00+02:00") };
    expect(terminBenoetigtUpdate(bestehend, geaendert, "m1")).toBe(true);
  });

  it("meldet ein Update, wenn sich das Ergebnis geändert hat", () => {
    const geaendert = { ...ereignis, ergebnisHeim: 25, ergebnisAuswaerts: 20 };
    expect(terminBenoetigtUpdate(bestehend, geaendert, "m1")).toBe(true);
  });

  it("meldet ein Update, wenn sich die zugeordnete Mannschaft geändert hat", () => {
    expect(terminBenoetigtUpdate(bestehend, ereignis, "m2")).toBe(true);
  });

  it("meldet ein Update, wenn sich das nuLiga-Schiedsrichter-Kürzel geändert hat", () => {
    const geaendert = { ...ereignis, schiedsrichterKuerzel: "Mü." };
    expect(terminBenoetigtUpdate(bestehend, geaendert, "m1")).toBe(true);
  });
});

describe("ermittleRundenspielAenderung", () => {
  it("liefert null, wenn sich weder Zeit/Ort noch Ergebnis geändert haben", () => {
    const geaendert = { ...ereignis, schiedsrichterKuerzel: "Mü." };
    expect(ermittleRundenspielAenderung(bestehend, geaendert)).toBeNull();
  });

  it("erkennt eine Verlegung bei geänderter Startzeit", () => {
    const geaendert = { ...ereignis, start: new Date("2026-09-02T18:00:00+02:00") };
    expect(ermittleRundenspielAenderung(bestehend, geaendert)).toEqual({
      verlegt: true,
      ergebnisNeu: false,
    });
  });

  it("erkennt eine Verlegung bei geändertem Ort", () => {
    const geaendert = { ...ereignis, ort: "Halle 2" };
    expect(ermittleRundenspielAenderung(bestehend, geaendert)).toEqual({
      verlegt: true,
      ergebnisNeu: false,
    });
  });

  it("erkennt ein neu eingetragenes Ergebnis", () => {
    const geaendert = { ...ereignis, ergebnisHeim: 25, ergebnisAuswaerts: 20 };
    expect(ermittleRundenspielAenderung(bestehend, geaendert)).toEqual({
      verlegt: false,
      ergebnisNeu: true,
    });
  });

  it("meldet kein neues Ergebnis, wenn bereits eins vorlag (z.B. Korrektur)", () => {
    const bestehendMitErgebnis = { ...bestehend, ergebnisHeim: 25, ergebnisAuswaerts: 20 };
    const geaendert = { ...ereignis, ergebnisHeim: 26, ergebnisAuswaerts: 20 };
    // Eine Ergebnis-KORREKTUR ist kein "neues" Ergebnis — terminBenoetigtUpdate
    // erkennt die Änderung trotzdem (siehe oben), nur eben nicht als
    // ergebnisNeu für die Benachrichtigung.
    expect(ermittleRundenspielAenderung(bestehendMitErgebnis, geaendert)).toBeNull();
  });
});
