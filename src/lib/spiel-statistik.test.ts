import { describe, expect, it } from "vitest";
import { berechneMannschaftsKennzahlen, berechneVereinsKennzahlen, type StatistikMannschaft } from "./spiel-statistik";
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
