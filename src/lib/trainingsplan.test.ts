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
