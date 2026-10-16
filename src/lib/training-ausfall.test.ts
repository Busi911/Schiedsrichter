import { describe, expect, it } from "vitest";
import {
  addiereTage,
  berlinJetzt,
  darfAusfallMelden,
  darfTrainingSehen,
  istGueltigesDatum,
  konkreteTrainings,
  pruefeAusfallDatum,
  wochentagVonDatum,
  type TrainingsZeile,
} from "./training-ausfall";

const zeile = (id: string, wochentag: number, start: number, ende: number): TrainingsZeile => ({
  id,
  mannschaftId: "m1",
  halleId: "h1",
  wochentag,
  startMinuten: start,
  endMinuten: ende,
  abteilNummer: null,
  farbe: "#000000",
});

// Donnerstag, 22.10.2026, 17:00 deutsche Zeit (MESZ endet am 25.10.: noch UTC+2)
const DO_17 = new Date("2026-10-22T15:00:00Z");

describe("Datum", () => {
  it("Wochentag: 0 = Montag", () => {
    expect(wochentagVonDatum("2026-10-19")).toBe(0);
    expect(wochentagVonDatum("2026-10-22")).toBe(3);
    expect(wochentagVonDatum("2026-10-25")).toBe(6);
  });
  it("addiert Tage über Monats- und Zeitumstellungsgrenzen", () => {
    expect(addiereTage("2026-10-30", 3)).toBe("2026-11-02");
    expect(addiereTage("2026-10-24", 2)).toBe("2026-10-26");
  });
  it("erkennt ungültige Daten", () => {
    expect(istGueltigesDatum("2026-02-30")).toBe(false);
    expect(istGueltigesDatum("22.10.2026")).toBe(false);
    expect(istGueltigesDatum("2026-10-22")).toBe(true);
  });
  it("berlinJetzt rechnet in deutscher Zeit (Tageswechsel)", () => {
    expect(berlinJetzt(new Date("2026-10-22T22:30:00Z"))).toEqual({ datum: "2026-10-23", minuten: 30 });
    expect(berlinJetzt(DO_17)).toEqual({ datum: "2026-10-22", minuten: 17 * 60 });
  });
});

describe("konkreteTrainings", () => {
  const donnerstag = zeile("a", 3, 16 * 60, 17 * 60 + 30);
  const spaeter = zeile("b", 3, 18 * 60, 19 * 60 + 30);
  const freitag = zeile("c", 4, 17 * 60, 18 * 60);

  it("macht aus dem Wochenplan datierte Trainings, sortiert nach Datum und Beginn", () => {
    const l = konkreteTrainings([freitag, spaeter, donnerstag], [], DO_17, 8);
    expect(l.map((t) => `${t.datum} ${t.id}`)).toEqual(["2026-10-22 a", "2026-10-22 b", "2026-10-23 c", "2026-10-29 a", "2026-10-29 b"]);
  });
  it("lässt heute bereits beendete Trainings weg, laufende bleiben", () => {
    expect(konkreteTrainings([donnerstag], [], DO_17, 1)).toHaveLength(1); // 16:00-17:30 läuft um 17:00
    expect(konkreteTrainings([zeile("x", 3, 15 * 60, 17 * 60)], [], DO_17, 1)).toHaveLength(0); // endet exakt jetzt
  });
  it("markiert Ausfälle und übernimmt den Grund; andere Wochen bleiben unberührt", () => {
    const l = konkreteTrainings([spaeter], [{ trainingszeitId: "b", datum: "2026-10-22", grund: "Halle gesperrt" }], DO_17, 8);
    expect(l.map((t) => [t.datum, t.ausgefallen, t.grund])).toEqual([
      ["2026-10-22", true, "Halle gesperrt"],
      ["2026-10-29", false, null],
    ]);
  });
});

describe("pruefeAusfallDatum", () => {
  const z = { wochentag: 3, endMinuten: 19 * 60 };
  it("akzeptiert ein künftiges Training am richtigen Wochentag", () => {
    expect(pruefeAusfallDatum(z, "2026-10-22", DO_17)).toBeNull();
    expect(pruefeAusfallDatum(z, "2026-10-29", DO_17)).toBeNull();
  });
  it("lehnt falschen Wochentag, Vergangenheit und Unsinn ab", () => {
    expect(pruefeAusfallDatum(z, "2026-10-23", DO_17)).toMatch(/nicht statt/);
    expect(pruefeAusfallDatum(z, "2026-10-15", DO_17)).toMatch(/vorbei/);
    expect(pruefeAusfallDatum({ wochentag: 3, endMinuten: 16 * 60 }, "2026-10-22", DO_17)).toMatch(/vorbei/);
    expect(pruefeAusfallDatum(z, "morgen", DO_17)).toMatch(/Ungültig/);
  });
});

describe("Berechtigungen", () => {
  const aus = { istAdmin: false, istAdminLesend: false, istTrainer: false, fuerAlleSichtbar: false };
  it("Training sehen: Admin und Trainer immer, sonst nur mit Freischaltung", () => {
    expect(darfTrainingSehen(aus)).toBe(false);
    expect(darfTrainingSehen({ ...aus, istTrainer: true })).toBe(true);
    expect(darfTrainingSehen({ ...aus, istAdmin: true })).toBe(true);
    expect(darfTrainingSehen({ ...aus, istAdminLesend: true })).toBe(true);
    expect(darfTrainingSehen({ ...aus, fuerAlleSichtbar: true })).toBe(true);
  });
  it("Ausfall melden: Admin oder Trainer der eigenen Mannschaft", () => {
    expect(darfAusfallMelden({ istAdmin: true, trainerMannschaftIds: [], mannschaftId: "m1" })).toBe(true);
    expect(darfAusfallMelden({ istAdmin: false, trainerMannschaftIds: ["m1"], mannschaftId: "m1" })).toBe(true);
    expect(darfAusfallMelden({ istAdmin: false, trainerMannschaftIds: ["m2"], mannschaftId: "m1" })).toBe(false);
  });
});
