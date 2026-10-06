import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVereinsuche } from "./parsers/vereinsuche";
import { parseVereinsInfo } from "./parsers/vereinsinfo";

// ACHTUNG: Die Fixtures sind nach Beschreibung NACHGEBAUT (kein Zugriff auf die echte Seite) —
// sie belegen die Logik, nicht, dass nuLiga genau so aussieht.
const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", n), "utf8");

describe("parseVereinsuche", () => {
  const { daten, warnungen } = parseVereinsuche(fixture("vereinsuche-bezirk.html"), "Gießen");
  it("trennt interne club-ID und sichtbare Vereinsnummer", () => {
    const linden = daten.vereine.find((v) => v.name === "HSG Linden");
    expect(linden).toEqual({ clubId: "76446", name: "HSG Linden", nummer: "14194", bezirk: "Gießen" });
    // Klammerzahl ist nie die club-ID
    expect(daten.vereine.find((v) => v.clubId === "14194")).toBeUndefined();
  });
  it("liest Nummer auch aus einer Nachbarzelle, Umlaute", () => {
    expect(daten.vereine.find((v) => v.clubId === "11111")).toMatchObject({ name: "SG Münster/Grün", nummer: "20202" });
  });
  it("findet die Bezirke und warnt bei leerer Seite", () => {
    expect(daten.regionen.map((r) => r.name)).toEqual(["Gießen", "Kassel"]);
    expect(daten.regionen[0].searchPattern).toBe("DE.SW.02.03");
    expect(warnungen).toEqual([]);
    expect(parseVereinsuche("<html></html>").warnungen).toHaveLength(1);
  });
});

describe("parseVereinsInfo", () => {
  const { daten } = parseVereinsInfo(fixture("vereinsinfo.html"));
  it("liest Stammdaten, Stammvereine und Hallen", () => {
    expect(daten).toEqual({
      name: "HSG Linden",
      nummer: "14194",
      gruendung: 2019,
      website: "https://www.beispiel-hsg.invalid",
      stammvereine: ["TV Beispiel", "TSV Muster"],
      hallen: ["Sporthalle Nord", "Kreissporthalle"],
    });
  });
  it("übernimmt keine Kontaktdaten", () => {
    const json = JSON.stringify(daten);
    for (const p of ["GEHEIM", "Mustermann", "@"]) expect(json).not.toContain(p);
  });
});
