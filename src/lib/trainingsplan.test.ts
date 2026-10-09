import { describe, expect, it } from "vitest";
import {
  formatUhrzeit,
  platziereZeitbloecke,
  rundeAufRaster,
  standardFarbeFuerMannschaft,
  TRAININGSFARBEN,
} from "./trainingsplan";

describe("rundeAufRaster", () => {
  it("rundet auf das nächste 15-Minuten-Raster", () => {
    expect(rundeAufRaster(0)).toBe(0);
    expect(rundeAufRaster(7)).toBe(0);
    expect(rundeAufRaster(8)).toBe(15);
    expect(rundeAufRaster(22)).toBe(15);
    expect(rundeAufRaster(23)).toBe(30);
    expect(rundeAufRaster(97)).toBe(90);
  });
});

describe("formatUhrzeit", () => {
  it("formatiert Minuten seit Mitternacht als HH:MM", () => {
    expect(formatUhrzeit(0)).toBe("00:00");
    expect(formatUhrzeit(90)).toBe("01:30");
    expect(formatUhrzeit(1425)).toBe("23:45");
  });
});

describe("standardFarbeFuerMannschaft", () => {
  it("liefert für dieselbe Mannschaft immer dieselbe Farbe aus der Palette", () => {
    const farbe = standardFarbeFuerMannschaft("mannschaft-1");
    expect(TRAININGSFARBEN).toContain(farbe);
    expect(standardFarbeFuerMannschaft("mannschaft-1")).toBe(farbe);
  });

  it("liefert für unterschiedliche IDs tendenziell unterschiedliche Farben", () => {
    const farben = new Set(
      ["a", "b", "c", "d", "e"].map((id) => standardFarbeFuerMannschaft(id))
    );
    expect(farben.size).toBeGreaterThan(1);
  });
});

describe("platziereZeitbloecke", () => {
  it("gibt nicht überlappenden Blöcken jeweils Lane 0 mit lanesGesamt 1", () => {
    const bloecke = [
      { id: "a", startMinuten: 0, endMinuten: 60 },
      { id: "b", startMinuten: 60, endMinuten: 120 },
    ];
    const platziert = platziereZeitbloecke(bloecke);
    expect(platziert.find((b) => b.id === "a")).toMatchObject({
      lane: 0,
      lanesGesamt: 1,
    });
    expect(platziert.find((b) => b.id === "b")).toMatchObject({
      lane: 0,
      lanesGesamt: 1,
    });
  });

  it("platziert zwei sich überlappende Blöcke in eigene Lanes derselben Gruppe", () => {
    const bloecke = [
      { id: "a", startMinuten: 0, endMinuten: 90 },
      { id: "b", startMinuten: 30, endMinuten: 60 },
    ];
    const platziert = platziereZeitbloecke(bloecke);
    const a = platziert.find((b) => b.id === "a")!;
    const b = platziert.find((b) => b.id === "b")!;
    expect(a.lanesGesamt).toBe(2);
    expect(b.lanesGesamt).toBe(2);
    expect(a.lane).not.toBe(b.lane);
  });

  it("gibt drei paarweise überlappenden Blöcken drei Lanes", () => {
    const bloecke = [
      { id: "a", startMinuten: 0, endMinuten: 60 },
      { id: "b", startMinuten: 0, endMinuten: 60 },
      { id: "c", startMinuten: 0, endMinuten: 60 },
    ];
    const platziert = platziereZeitbloecke(bloecke);
    expect(platziert.every((b) => b.lanesGesamt === 3)).toBe(true);
    expect(new Set(platziert.map((b) => b.lane)).size).toBe(3);
  });

  it("wiederverwendet eine frei gewordene Lane, sobald ihr Block endet", () => {
    const bloecke = [
      { id: "a", startMinuten: 0, endMinuten: 30 },
      { id: "b", startMinuten: 0, endMinuten: 60 },
      // c beginnt erst, nachdem a (Lane 0 oder 1) schon vorbei ist.
      { id: "c", startMinuten: 30, endMinuten: 90 },
    ];
    const platziert = platziereZeitbloecke(bloecke);
    // a und c dürfen sich eine Lane teilen (keine zeitliche Überschneidung),
    // b braucht durchgehend eine eigene — macht insgesamt 2 statt 3 Lanes.
    expect(platziert.every((b) => b.lanesGesamt === 2)).toBe(true);
  });

  it("behandelt zeitlich getrennte Blöcke als unabhängige Überschneidungsgruppen", () => {
    const bloecke = [
      { id: "a", startMinuten: 0, endMinuten: 60 },
      { id: "b", startMinuten: 0, endMinuten: 60 },
      // d/e überschneiden sich zwar gegenseitig, aber NICHT mit a/b (Lücke
      // dazwischen) — dürfen also nicht dieselbe lanesGesamt wie a/b tragen.
      { id: "d", startMinuten: 120, endMinuten: 180 },
      { id: "e", startMinuten: 120, endMinuten: 180 },
    ];
    const platziert = platziereZeitbloecke(bloecke);
    expect(platziert.find((b) => b.id === "a")!.lanesGesamt).toBe(2);
    expect(platziert.find((b) => b.id === "d")!.lanesGesamt).toBe(2);
  });
});

import { abteilAusPosition, abteilSpur, findeKonflikte, pruefeTeilung, type BelegungsEintrag } from "./trainingsplan";

describe("Abteile und Konflikte", () => {
  const b = (id: string, mannschaftId: string, abteil: number | null, start: number, ende: number, tag = 0, halleId = "h1"): BelegungsEintrag => ({
    id,
    mannschaftId,
    halleId,
    wochentag: tag,
    startMinuten: start,
    endMinuten: ende,
    abteilNummer: abteil,
  });
  const hallen = new Map([["h1", 2], ["h2", 0]]);

  it("Abteil-Spur und Position", () => {
    expect(abteilSpur(2, 2)).toEqual({ links: 0.5, breite: 0.5 });
    expect(abteilSpur(4, 1)).toEqual({ links: 0, breite: 0.25 });
    expect(abteilSpur(2, null)).toEqual({ links: 0, breite: 1 }); // ganze Halle
    expect(abteilSpur(0, 3)).toEqual({ links: 0, breite: 1 });
    expect(abteilAusPosition(2, 0.2)).toBe(1);
    expect(abteilAusPosition(2, 0.9)).toBe(2);
    expect(abteilAusPosition(4, 1)).toBe(4);
    expect(abteilAusPosition(0, 0.5)).toBeNull();
  });
  it("gleiches Abteil zur gleichen Zeit ist ein Konflikt, verschiedene Abteile nicht", () => {
    expect(findeKonflikte([b("a", "m1", 1, 1020, 1080), b("b", "m2", 1, 1050, 1110)], hallen)).toMatchObject([{ art: "abteil", von: 1050, bis: 1080, abteilNummer: 1 }]);
    expect(findeKonflikte([b("a", "m1", 1, 1020, 1080), b("b", "m2", 2, 1020, 1080)], hallen)).toEqual([]);
  });
  it("direkt aneinander (Wechsel) ist kein Konflikt", () => {
    expect(findeKonflikte([b("a", "m1", 1, 1020, 1050), b("b", "m1", 2, 1050, 1080)], hallen)).toEqual([]);
  });
  it("dieselbe Mannschaft zweimal gleichzeitig, auch in anderer Halle oder Abteil", () => {
    expect(findeKonflikte([b("a", "m1", 1, 1020, 1080), b("b", "m1", 2, 1020, 1080)], hallen)[0].art).toBe("doppelt");
    expect(findeKonflikte([b("a", "m1", null, 1020, 1080, 0, "h1"), b("b", "m1", null, 1040, 1100, 0, "h2")], hallen)[0].art).toBe("doppelt");
  });
  it("ohne Abteil in unterteilter Halle nur als Hinweis, in nicht unterteilter Halle gar nicht", () => {
    expect(findeKonflikte([b("a", "m1", null, 1020, 1080), b("b", "m2", 2, 1020, 1080)], hallen)[0].art).toBe("ohne_abteil");
    expect(findeKonflikte([b("a", "m1", null, 1020, 1080, 0, "h2"), b("b", "m2", null, 1020, 1080, 0, "h2")], hallen)).toEqual([]);
  });
  it("andere Wochentage kollidieren nicht", () => {
    expect(findeKonflikte([b("a", "m1", 1, 1020, 1080, 0), b("b", "m2", 1, 1020, 1080, 1)], hallen)).toEqual([]);
  });
  it("Teilung nur auf dem Raster und innerhalb des Trainings", () => {
    expect(pruefeTeilung(1020, 1080, 1050)).toBeNull();
    expect(pruefeTeilung(1020, 1080, 1055)).not.toBeNull();
    expect(pruefeTeilung(1020, 1080, 1020)).not.toBeNull();
    expect(pruefeTeilung(1020, 1080, 1080)).not.toBeNull();
  });
});
