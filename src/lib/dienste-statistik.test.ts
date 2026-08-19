import { describe, expect, it } from "vitest";
import { berechneGesamtbilanz, berechneMannschaftsBilanzen } from "./dienste-statistik";

describe("berechneMannschaftsBilanzen", () => {
  it("zählt einen Sieg, wenn die eigene Mannschaft (heim) mehr Tore erzielt", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "m1",
        mannschaftName: "Herren 1",
        mannschaftAltersklasse: null,
        heimMannschaftName: "TSF Heuchelheim Herren 1",
        auswaertsMannschaftName: "SV Beispiel",
        ergebnisHeim: 28,
        ergebnisAuswaerts: 20,
      },
    ]);
    expect(bilanzen).toEqual([
      { mannschaftId: "m1", label: "Herren 1", siege: 1, unentschieden: 0, niederlagen: 0, spiele: 1 },
    ]);
  });

  it("zählt eine Niederlage, wenn die eigene Mannschaft (auswärts) verliert", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "m1",
        mannschaftName: "Herren 1",
        mannschaftAltersklasse: "M",
        heimMannschaftName: "SV Beispiel",
        auswaertsMannschaftName: "TSF Heuchelheim Herren 1",
        ergebnisHeim: 28,
        ergebnisAuswaerts: 20,
      },
    ]);
    expect(bilanzen[0]).toMatchObject({ siege: 0, niederlagen: 1, unentschieden: 0 });
    expect(bilanzen[0].label).toBe("Herren 1 (M)");
  });

  it("zählt ein Unentschieden bei gleichem Ergebnis", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "m1",
        mannschaftName: "Herren 1",
        mannschaftAltersklasse: null,
        heimMannschaftName: "Herren 1",
        auswaertsMannschaftName: "SV Beispiel",
        ergebnisHeim: 24,
        ergebnisAuswaerts: 24,
      },
    ]);
    expect(bilanzen[0]).toMatchObject({ unentschieden: 1, siege: 0, niederlagen: 0 });
  });

  it("summiert mehrere Spiele derselben Mannschaft", () => {
    const basis = {
      mannschaftId: "m1",
      mannschaftName: "Herren 1",
      mannschaftAltersklasse: null,
    };
    const bilanzen = berechneMannschaftsBilanzen([
      { ...basis, heimMannschaftName: "Herren 1", auswaertsMannschaftName: "A", ergebnisHeim: 30, ergebnisAuswaerts: 20 },
      { ...basis, heimMannschaftName: "B", auswaertsMannschaftName: "Herren 1", ergebnisHeim: 30, ergebnisAuswaerts: 20 },
      { ...basis, heimMannschaftName: "Herren 1", auswaertsMannschaftName: "C", ergebnisHeim: 22, ergebnisAuswaerts: 22 },
    ]);
    expect(bilanzen[0]).toMatchObject({ siege: 1, niederlagen: 1, unentschieden: 1, spiele: 3 });
  });

  it("ignoriert ein Spiel, wenn die eigene Mannschaft weder heim noch auswärts eindeutig zuordenbar ist", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "m1",
        mannschaftName: "Herren 1",
        mannschaftAltersklasse: null,
        heimMannschaftName: "Ganz anderer Verein",
        auswaertsMannschaftName: "Noch ein anderer",
        ergebnisHeim: 20,
        ergebnisAuswaerts: 20,
      },
    ]);
    expect(bilanzen).toEqual([]);
  });

  it("erkennt die eigene Mannschaft auch als Wortteil im Roh-Namen (wie findeMannschaft)", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "m1",
        mannschaftName: "Herren 1",
        mannschaftAltersklasse: null,
        heimMannschaftName: "TSF Heuchelheim Herren 1",
        auswaertsMannschaftName: "SV Beispiel",
        ergebnisHeim: 30,
        ergebnisAuswaerts: 10,
      },
    ]);
    expect(bilanzen[0]).toMatchObject({ siege: 1 });
  });

  it("sortiert nach Tordifferenz der Siege/Niederlagen, bei Gleichstand nach Spielanzahl", () => {
    const bilanzen = berechneMannschaftsBilanzen([
      {
        mannschaftId: "wenig-siege",
        mannschaftName: "Team A",
        mannschaftAltersklasse: null,
        heimMannschaftName: "Team A",
        auswaertsMannschaftName: "X",
        ergebnisHeim: 30,
        ergebnisAuswaerts: 10,
      },
      {
        mannschaftId: "viele-siege",
        mannschaftName: "Team B",
        mannschaftAltersklasse: null,
        heimMannschaftName: "Team B",
        auswaertsMannschaftName: "X",
        ergebnisHeim: 30,
        ergebnisAuswaerts: 10,
      },
      {
        mannschaftId: "viele-siege",
        mannschaftName: "Team B",
        mannschaftAltersklasse: null,
        heimMannschaftName: "Team B",
        auswaertsMannschaftName: "Y",
        ergebnisHeim: 30,
        ergebnisAuswaerts: 10,
      },
    ]);
    expect(bilanzen.map((b) => b.mannschaftId)).toEqual(["viele-siege", "wenig-siege"]);
  });
});

describe("berechneGesamtbilanz", () => {
  it("summiert Spiele/Siege über alle Mannschaften und rundet die Siegquote", () => {
    const gesamt = berechneGesamtbilanz([
      { mannschaftId: "a", label: "A", siege: 2, unentschieden: 0, niederlagen: 1, spiele: 3 },
      { mannschaftId: "b", label: "B", siege: 1, unentschieden: 1, niederlagen: 0, spiele: 2 },
    ]);
    expect(gesamt).toEqual({ spiele: 5, siegquote: 60 });
  });

  it("liefert null als Siegquote ohne Spiele", () => {
    expect(berechneGesamtbilanz([])).toEqual({ spiele: 0, siegquote: null });
  });
});
