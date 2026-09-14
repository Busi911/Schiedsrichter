import { describe, expect, it } from "vitest";
import { findeFunktionstraegerDuplikate } from "./funktionstraeger-duplikate";

describe("findeFunktionstraegerDuplikate", () => {
  it("findet ein Paar mit exakt gleichem Namen (andere Groß-/Kleinschreibung)", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: "Max Mustermann" },
      { userId: "b", name: "max  mustermann" },
    ]);

    expect(treffer).toHaveLength(1);
    expect(treffer[0].map((p) => p.userId)).toEqual(["a", "b"]);
  });

  it("findet ein Paar mit einem Tippfehler in einem Namensteil", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: "Alexander Gehle" },
      { userId: "b", name: "Alexander Gehl" },
    ]);

    expect(treffer).toHaveLength(1);
  });

  it("markiert zwei unterschiedliche Personen mit nur gleichem Vornamen NICHT als Duplikat", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: "Alexander Gehle" },
      { userId: "b", name: "Alexander Hergert" },
    ]);

    expect(treffer).toHaveLength(0);
  });

  it("markiert einen einzelnen Vornamen gegen einen vollen Namen NICHT als Duplikat", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: "Michael" },
      { userId: "b", name: "Michael Papke" },
    ]);

    expect(treffer).toHaveLength(0);
  });

  it("ignoriert Personen ohne Namen", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: null },
      { userId: "b", name: null },
    ]);

    expect(treffer).toHaveLength(0);
  });

  it("prüft alle Paare, nicht nur benachbarte Einträge", () => {
    const treffer = findeFunktionstraegerDuplikate([
      { userId: "a", name: "Max Mustermann" },
      { userId: "b", name: "Erika Musterfrau" },
      { userId: "c", name: "Max Mustermann" },
    ]);

    expect(treffer).toHaveLength(1);
    expect(treffer[0].map((p) => p.userId)).toEqual(["a", "c"]);
  });
});
