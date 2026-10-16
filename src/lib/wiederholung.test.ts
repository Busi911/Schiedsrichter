import { describe, expect, it } from "vitest";
import { berechneSerie, MAX_SERIEN_TERMINE, nteWochentagImMonat, serienText } from "./wiederholung";
import { toDatetimeLocalWert } from "./format";

// Donnerstag, 22.10.2026, 19:00 deutsche Zeit (MESZ, UTC+2)
const START = new Date("2026-10-22T17:00:00Z");
const lokalListe = (l: Date[]) => l.map(toDatetimeLocalWert);

describe("berechneSerie", () => {
  it("wöchentlich bis einschließlich dem letzten Tag", () => {
    expect(lokalListe(berechneSerie(START, "woechentlich", "2026-11-12"))).toEqual([
      "2026-10-22T19:00",
      "2026-10-29T19:00",
      "2026-11-05T19:00",
      "2026-11-12T19:00",
    ]);
  });
  it("alle 2 Wochen", () => {
    expect(lokalListe(berechneSerie(START, "zweiwoechentlich", "2026-11-30"))).toEqual(["2026-10-22T19:00", "2026-11-05T19:00", "2026-11-19T19:00"]);
  });
  it("die Uhrzeit bleibt über die Zeitumstellung (Ende der Sommerzeit am 25.10.2026) gleich", () => {
    const serie = berechneSerie(START, "woechentlich", "2026-11-05");
    expect(lokalListe(serie)).toEqual(["2026-10-22T19:00", "2026-10-29T19:00", "2026-11-05T19:00"]);
    expect(serie[1].toISOString()).toBe("2026-10-29T18:00:00.000Z"); // Winterzeit: 19:00 = 18:00 UTC
  });
  it("monatlich: jeden n-ten Wochentag (4. Donnerstag), auch über den Jahreswechsel", () => {
    // 22.10.2026 ist der 4. Donnerstag
    expect(lokalListe(berechneSerie(START, "monatlich", "2027-02-28"))).toEqual([
      "2026-10-22T19:00",
      "2026-11-26T19:00",
      "2026-12-24T19:00",
      "2027-01-28T19:00",
      "2027-02-25T19:00",
    ]);
  });
  it("monatlich: der 5. Wochentag fällt in kürzeren Monaten auf den letzten", () => {
    // 29.10.2026 ist der 5. Donnerstag; im November gibt es nur vier, also der letzte (26.11.)
    const start = new Date("2026-10-29T18:00:00Z"); // Winterzeit: 19:00
    expect(lokalListe(berechneSerie(start, "monatlich", "2026-12-31"))).toEqual(["2026-10-29T19:00", "2026-11-26T19:00", "2026-12-31T19:00"]);
  });
  it("letzter Tag vor dem Start ergibt nur den ersten Termin", () => {
    expect(berechneSerie(START, "woechentlich", "2026-01-01")).toEqual([START]);
  });
  it("höchstens 52 Termine", () => {
    expect(berechneSerie(START, "woechentlich", "2030-12-31")).toHaveLength(MAX_SERIEN_TERMINE);
  });
  it("der erste Termin ist exakt der Start (auch bei Minuten)", () => {
    const s = new Date("2026-10-22T17:25:00Z");
    expect(berechneSerie(s, "woechentlich", "2026-10-30")[0]).toBe(s);
    expect(lokalListe(berechneSerie(s, "woechentlich", "2026-10-30"))[1]).toBe("2026-10-29T19:25");
  });
});

describe("nteWochentagImMonat / serienText", () => {
  it("findet den n-ten Wochentag", () => {
    expect(nteWochentagImMonat(2026, 11, 3, 1)).toBe("2026-11-05"); // 1. Donnerstag im November
    expect(nteWochentagImMonat(2026, 2, 0, 5)).toBe("2026-02-23"); // kein 5. Montag im Februar 2026: der letzte
  });
  it("beschreibt den Rhythmus in Worten", () => {
    expect(serienText("monatlich", START)).toBe("jeden 4. Donnerstag im Monat");
    expect(serienText("woechentlich", START)).toBe("jede Woche am Donnerstag");
    expect(serienText("zweiwoechentlich", START)).toBe("alle 2 Wochen am Donnerstag");
  });
});
