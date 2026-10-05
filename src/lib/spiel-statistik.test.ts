import { describe, expect, it } from "vitest";
import { berechneMannschaftsKennzahlen, berechneVereinsKennzahlen, berechneWoche, type StatistikMannschaft } from "./spiel-statistik";
import type { SpielAnsicht } from "./liga-spiele-hilfen";

const jetzt = new Date("2026-10-05T12:00:00Z");
let nr = 0;
const spiel = (x: Partial<SpielAnsicht>) =>
  ({
    id: `s${nr++}`,
    status: "gespielt",
    ergebnisBestaetigt: true,
    datum: "2026-09-01",
    uhrzeit: "18:00",
    beginn: new Date("2026-09-01T16:00:00Z"),
    heimName: "Wir",
    gastName: "Gegner",
    halbzeitHeim: null,
    halbzeitGast: null,
    ...x,
  }) as SpielAnsicht;
const heim = (h: number, g: number, x: Partial<SpielAnsicht> = {}) =>
  spiel({ heimTeamtableId: "T", gastTeamtableId: "X", toreHeim: h, toreGast: g, ...x });
const aus = (h: number, g: number, x: Partial<SpielAnsicht> = {}) =>
  spiel({ heimTeamtableId: "X", gastTeamtableId: "T", toreHeim: h, toreGast: g, ...x });
const team = (spiele: SpielAnsicht[]): StatistikMannschaft => ({ id: "m", name: "Männer", altersklasse: null, teamtableId: "T", spiele });

describe("berechneMannschaftsKennzahlen", () => {
  it("zählt Bilanz, Tore, Heim/Auswärts und Schnitt", () => {
    const k = berechneMannschaftsKennzahlen(team([heim(30, 20), aus(25, 25), aus(20, 28), heim(22, 30)]), jetzt)!;
    expect(k).toMatchObject({ spiele: 4, siege: 2, unentschieden: 1, niederlagen: 1, siegquote: 50, torePlus: 105, toreMinus: 95 });
    expect(k.heim).toMatchObject({ spiele: 2, siege: 1, niederlagen: 1 });
    expect(k.auswaerts).toMatchObject({ spiele: 2, siege: 1, unentschieden: 1 });
    expect(k.schnittPlus).toBe(26.3);
  });
  it("findet höchsten Sieg, torreichstes Spiel und die letzten 5 Spiele als Form", () => {
    const sp = [1, 2, 3, 4, 5, 6].map((i) => heim(20 + i, 20, { datum: `2026-09-0${i}` }));
    const k = berechneMannschaftsKennzahlen(team([...sp, aus(18, 35, { datum: "2026-09-09" })]), jetzt)!;
    expect(k.hoechsterSieg).toMatchObject({ eigen: 35, gegner: 18, heim: false });
    expect(k.torreichstes!.summe).toBe(53);
    expect(k.form).toHaveLength(5);
    expect(k.form.at(-1)).toBe("S");
  });
  it("ignoriert Spiele ohne Ergebnis, Nichtantritte und Zwischenstände", () => {
    const laufend = heim(19, 6, { ergebnisBestaetigt: false, beginn: new Date("2026-10-05T10:00:00Z") });
    const k = berechneMannschaftsKennzahlen(
      team([heim(null as unknown as number, null as unknown as number), heim(20, 0, { status: "nicht_angetreten" }), laufend]),
      jetzt
    );
    expect(k).toBeNull();
  });
  it("wertet Halbzeitstände aus (Führung, Siege nach Führung, gedreht)", () => {
    const k = berechneMannschaftsKennzahlen(
      team([
        heim(30, 20, { halbzeitHeim: 15, halbzeitGast: 10 }),
        heim(20, 25, { halbzeitHeim: 12, halbzeitGast: 10 }),
        aus(20, 25, { halbzeitHeim: 12, halbzeitGast: 10 }),
      ]),
      jetzt
    )!;
    expect(k.halbzeit).toEqual({ spiele: 3, fuehrungZurPause: 2, siegNachFuehrung: 1, gedreht: 1 });
  });
  it("ohne teamtable keine Statistik", () => {
    expect(berechneMannschaftsKennzahlen({ ...team([heim(1, 0)]), teamtableId: null }, jetzt)).toBeNull();
  });
});

describe("berechneVereinsKennzahlen", () => {
  it("summiert über Mannschaften", () => {
    const a = berechneMannschaftsKennzahlen(team([heim(30, 20), heim(20, 30)]), jetzt)!;
    const g = berechneVereinsKennzahlen([a, a]);
    expect(g).toMatchObject({ mannschaften: 2, spiele: 4, siege: 2, niederlagen: 2, siegquote: 50, torePlus: 100, toreMinus: 100 });
    expect(berechneVereinsKennzahlen([]).siegquote).toBeNull();
  });
});

describe("Saisonverlauf und Duelle", () => {
  it("summiert Punkte (2/1/0) und Tordifferenz nach jedem Spiel", () => {
    const k = berechneMannschaftsKennzahlen(
      team([heim(30, 20, { datum: "2026-09-01" }), aus(25, 25, { datum: "2026-09-08" }), heim(20, 28, { datum: "2026-09-15" })]),
      jetzt
    )!;
    expect(k.verlauf).toEqual([
      { punkte: 2, diff: 10 },
      { punkte: 3, diff: 10 },
      { punkte: 3, diff: 2 },
    ]);
  });
  it("gruppiert Duelle nach Gegner-ID inkl. noch ausstehender Spiele, abgesagte fehlen", () => {
    const k = berechneMannschaftsKennzahlen(
      team([
        heim(30, 20, { datum: "2026-09-01", gastName: "TV A", gastTeamtableId: "A" }),
        aus(null as unknown as number, null as unknown as number, { datum: "2026-12-01", heimName: "TV A", heimTeamtableId: "A" }),
        heim(20, 20, { datum: "2026-09-08", gastName: "TV B", gastTeamtableId: "B", status: "abgesagt" }),
      ]),
      jetzt
    )!;
    expect(k.duelle).toHaveLength(1);
    expect(k.duelle[0].gegnerName).toBe("TV A");
    expect(k.duelle[0].spiele).toEqual([
      { datum: "2026-09-01", heim: true, eigen: 30, gegner: 20 },
      { datum: "2026-12-01", heim: false, eigen: null, gegner: null },
    ]);
  });
});

describe("berechneWoche", () => {
  const heute = "2026-10-07"; // Mittwoch -> Woche 05.10.-11.10.
  const im = (x: Partial<SpielAnsicht>) => spiel({ datum: "2026-10-10", ...x });
  it("zählt Spiele der laufenden Woche einmal, mit Siegen/Niederlagen und offenen Spielen", () => {
    const m1 = team([im({ id: "a", heimTeamtableId: "T", gastTeamtableId: "X", toreHeim: 30, toreGast: 20 }), im({ id: "b", heimTeamtableId: "X", gastTeamtableId: "T", toreHeim: null, toreGast: null }), spiel({ id: "alt", datum: "2026-09-30", heimTeamtableId: "T", gastTeamtableId: "X", toreHeim: 1, toreGast: 0 })]);
    const w = berechneWoche([m1], jetzt, heute)!;
    expect(w).toMatchObject({ von: "2026-10-05", bis: "2026-10-11", spiele: 2, gespielt: 1, siege: 1, niederlagen: 0, torePlus: 30, toreMinus: 20 });
  });
  it("ein Duell zweier eigener Mannschaften zählt einmal und ohne Sieg/Niederlage", () => {
    const a = team([im({ id: "d", heimTeamtableId: "T", gastTeamtableId: "U", toreHeim: 30, toreGast: 20 })]);
    const b = { ...a, id: "m2", teamtableId: "U" };
    const w = berechneWoche([a, b], jetzt, heute)!;
    expect(w).toMatchObject({ spiele: 1, gespielt: 1, siege: 0, unentschieden: 0, niederlagen: 0 });
  });
  it("keine Spiele in der Woche -> null", () => {
    expect(berechneWoche([team([spiel({ datum: "2026-09-01", heimTeamtableId: "T", gastTeamtableId: "X", toreHeim: 1, toreGast: 0 })])], jetzt, heute)).toBeNull();
  });
});
