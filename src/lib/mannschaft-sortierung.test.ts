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
});
