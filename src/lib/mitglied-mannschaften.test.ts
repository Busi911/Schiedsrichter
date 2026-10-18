import { describe, expect, it } from "vitest";
import { istSaisonLabel, pruefeZuordnung, saisonOptionen } from "./mitglied-mannschaften";

describe("istSaisonLabel", () => {
  it.each(["2026/27", "2099/00"])("%s gültig", (s) => expect(istSaisonLabel(s)).toBe(true));
  it.each(["2026/28", "26/27", "2026-27", "2026/2027", ""])("%s ungültig", (s) => expect(istSaisonLabel(s)).toBe(false));
});

describe("pruefeZuordnung", () => {
  const ok = { mitgliedId: "m", mannschaftId: "t", saison: "2026/27", rolle: "" };
  it("Standardrolle Spieler", () => expect(pruefeZuordnung(ok)).toEqual({ wert: { mitgliedId: "m", mannschaftId: "t", saison: "2026/27", rolle: "spieler" } }));
  it("lehnt Fehlendes und Ungültiges ab", () => {
    expect(pruefeZuordnung({ ...ok, mannschaftId: " " })).toHaveProperty("fehler");
    expect(pruefeZuordnung({ ...ok, saison: "2026" })).toHaveProperty("fehler");
    expect(pruefeZuordnung({ ...ok, rolle: "kapitaen" })).toHaveProperty("fehler");
    expect(pruefeZuordnung({ ...ok, mitgliedId: "" })).toHaveProperty("fehler");
  });
});

describe("saisonOptionen", () => {
  it("laufende, nächste und vorige Saison, neueste zuerst, ohne Doppelte", () => {
    expect(saisonOptionen("2026/27", ["2024/25", "2026/27", "kaputt"])).toEqual(["2027/28", "2026/27", "2025/26", "2024/25"]);
  });
});
