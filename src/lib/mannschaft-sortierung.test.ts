import { describe, expect, it } from "vitest";
import { sortiereMannschaften } from "./mannschaft-sortierung";

describe("sortiereMannschaften", () => {
  it("sortiert Männer vor Frauen vor Jugend A-E vor Mini/Maxi", () => {
    const namen = [
      "Maxis",
      "Minis",
      "E-Jugend",
      "D-Jugend",
      "C-Jugend",
      "B-Jugend",
      "A-Jugend",
      "Damen 1",
      "Herren 1",
    ].map((name) => ({ name }));

    expect(sortiereMannschaften(namen).map((m) => m.name)).toEqual([
      "Herren 1",
      "Damen 1",
      "A-Jugend",
      "B-Jugend",
      "C-Jugend",
      "D-Jugend",
      "E-Jugend",
      "Minis",
      "Maxis",
    ]);
  });

  it("hält Mannschaft 1 und 2 derselben Kategorie direkt untereinander", () => {
    const namen = ["Herren 2", "Damen 1", "Herren 1", "Damen 2"].map((name) => ({
      name,
    }));

    expect(sortiereMannschaften(namen).map((m) => m.name)).toEqual([
      "Herren 1",
      "Herren 2",
      "Damen 1",
      "Damen 2",
    ]);
  });

  it("erkennt Jugend-Kategorien auch mit Geschlechts-Präfix", () => {
    const namen = ["weibliche C-Jugend", "männliche A-Jugend", "Herren 1"].map(
      (name) => ({ name })
    );

    expect(sortiereMannschaften(namen).map((m) => m.name)).toEqual([
      "Herren 1",
      "männliche A-Jugend",
      "weibliche C-Jugend",
    ]);
  });

  it("sortiert unbekannte Namen alphabetisch ans Ende", () => {
    const namen = ["Zeta-Team", "Herren 1", "Alpha-Team"].map((name) => ({
      name,
    }));

    expect(sortiereMannschaften(namen).map((m) => m.name)).toEqual([
      "Herren 1",
      "Alpha-Team",
      "Zeta-Team",
    ]);
  });

  it("nutzt die Altersklasse, wenn alle Mannschaften gleich heißen (nuLiga-Kürzel)", () => {
    const n = "HSG Dutenh./Münchholzh.";
    const liste = [
      { name: n, altersklasse: "WJD" },
      { name: n, altersklasse: "WJC" },
      { name: n, altersklasse: "MJC" },
      { name: n, altersklasse: "WJE" },
      { name: n, altersklasse: "WJA" },
      { name: n, altersklasse: "MJA" },
      { name: n, altersklasse: "F" },
      { name: `${n} II`, altersklasse: "F" },
      { name: n, altersklasse: "M" },
    ];
    expect(sortiereMannschaften(liste).map((m) => `${m.name === n ? "" : "II "}${m.altersklasse}`)).toEqual([
      "M",
      "F",
      "II F",
      "MJA",
      "WJA",
      "MJC",
      "WJC",
      "WJD",
      "WJE",
    ]);
  });

  it("versteht auch das Hallenplan- und Demo-Format der Altersklasse", () => {
    const liste = [
      { name: "x", altersklasse: "wC" },
      { name: "x", altersklasse: "Fr/weibl." },
      { name: "x", altersklasse: "mJB" },
      { name: "x", altersklasse: "Mä/männl." },
    ];
    expect(sortiereMannschaften(liste).map((m) => m.altersklasse)).toEqual(["Mä/männl.", "Fr/weibl.", "mJB", "wC"]);
  });
});
