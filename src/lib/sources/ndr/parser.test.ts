// Tests des NDR-Parsers gegen NACHGEBAUTE Fixtures (siehe __fixtures__/README.md). Nur Spiel-, Ergebnis- und Tabellendaten.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SportDeLayoutFehler } from "../sportde/types";
import { deuteNdrZeile, parseNdrSeite, parseNdrSpieltag } from "./parser";
import { zerlege } from "../sportde/zeile";
import { findeSpieltagLinks, matchSchluessel, spieltagPfad } from "./urls";

const fixture = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n), "utf8");
const HBL2 = fixture("hbl2-saison.html");
const HBL1 = fixture("hbl1-spieltag2.html");
const JETZT = new Date("2026-10-05T12:00:00Z");

describe("ndr: URLs", () => {
  it("baut die Adressen", () => {
    expect(spieltagPfad("hbl1", 2, 2026)).toBe("/sport/ergebnisse/handballmaenner-182~_matchDay-2.html");
    expect(spieltagPfad("hbl2", 5, 2026)).toBe("/sport/ergebnisse/Alle-Ergebnisse-2-Handball-Bundesliga-2026-2027%2Chandballmaenner-186.html");
  });
  it("liest Spieltag-Links aus dem HTML und bildet stabile Spielschlüssel", () => {
    expect(findeSpieltagLinks(["/x/handballmaenner-182~_matchDay-3.html", "/y.html", "/x/handballmaenner-182~_matchDay-1.html"]).map((l) => l.spieltag)).toEqual([1, 3]);
    expect(matchSchluessel("hbl1", 2026, 2, "HC Hamburg", "TVB Stuttgart")).toBe("hbl1-2026-27-md2-hc-hamburg_tvb-stuttgart");
  });
});

describe("ndr: Zeilen", () => {
  it("Uhrzeit vor den Namen, Ergebnis dahinter, Halbzeit mit Beschriftung", () => {
    expect(deuteNdrZeile(zerlege("Fr, 02.10.2026 | 19:00 | TuS N-Lübbecke | HSC 2000 Coburg | 26:26 | Halbzeit: 13:12"))).toMatchObject({ heim: "TuS N-Lübbecke", gast: "HSC 2000 Coburg", uhrzeit: "19:00", heimTore: 26, gastTore: 26, halbzeitHeim: 13, halbzeitGast: 12, status: "finished" });
  });
  it("noch nicht gespielt: ein einzelnes Paar hinter den Namen ist die Uhrzeit", () => {
    expect(deuteNdrZeile(zerlege("TV A | TV B | 19:30"))).toMatchObject({ uhrzeit: "19:30", heimTore: null, status: "scheduled" });
  });
  it("kein Spiel bei mehr als zwei Namen", () => {
    expect(deuteNdrZeile(zerlege("Datum | Paarung | Erg."))).toBeNull();
  });
});

describe("ndr: 2. HBL (zentrale Saisonseite)", () => {
  const s = parseNdrSeite(HBL2, { liga: "hbl2", saison: "2026/27", jetzt: JETZT });
  it("liest die Spiele nach Abschnitten und beachtet Spielzeiten", () => {
    expect(s.spieltage).toEqual([6, 7]);
    expect(s.spiele).toHaveLength(4);
    const luebbecke = s.spiele.find((x) => x.home.name === "TuS N-Lübbecke")!;
    expect(luebbecke).toMatchObject({ spieltag: 6, datum: "2026-10-02", uhrzeit: "19:00", homeScore: 26, awayScore: 26, halftimeHomeScore: 13, halftimeAwayScore: 12, status: "finished", away: { name: "HSC 2000 Coburg" } });
    const essen = s.spiele.find((x) => x.home.name === "TuSEM Essen")!;
    expect(essen).toMatchObject({ homeScore: 32, awayScore: 35, halftimeHomeScore: 14, halftimeAwayScore: 19, away: { name: "DHfK Leipzig" } });
    expect(essen.home.logoUrl).toBe("https://www.ndr.de/resources/logos/essen.png"); // aus dem tatsächlichen img/src, nicht konstruiert
    expect(s.spiele.find((x) => x.home.name === "TV Großwallstadt")).toMatchObject({ homeScore: 30, awayScore: 28, halftimeHomeScore: 17, halftimeAwayScore: 17 });
    expect(s.aktuellerSpieltag).toBe(6);
  });
  it("künftiges Spiel: geplant, ohne Ergebnis", () => {
    expect(s.spiele.find((x) => x.spieltag === 7)).toMatchObject({ status: "scheduled", homeScore: null, datum: "2026-10-09", uhrzeit: "19:00" });
  });
  it("liest die Tabelle mit Toren und Punkten als Paar", () => {
    const t = s.tabellen.get(6)!;
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ rang: 1, name: "1. VfL Potsdam", spiele: 6, siege: 6, unentschieden: 0, niederlagen: 0, tordifferenz: 17, torePlus: 182, toreMinus: 165, punktePlus: 12, punkteMinus: 0, logoUrl: "https://www.ndr.de/resources/logos/potsdam.png" });
    expect(t[1]).toMatchObject({ name: "HC Elbflorenz 2006", tordifferenz: 44, torePlus: 228, toreMinus: 184, punktePlus: 10, punkteMinus: 2 });
  });
  it("Teams aus Tabelle und Spielen, Schlüssel aus dem Namen", () => {
    const leipzig = s.teams.find((t) => t.name === "DHfK Leipzig");
    expect(leipzig?.externalId).toBe("name:dhfk-leipzig");
    expect(s.spiele.find((x) => x.away.name === "1. VfL Potsdam")?.away.logoUrl).toBe("https://www.ndr.de/resources/logos/potsdam.png"); // Logo aus der Tabelle
  });
  it("grenzt einen Spieltag ein; Spieltag ohne Abschnitt bleibt leer (Warnung statt Fehler)", () => {
    expect(parseNdrSpieltag(HBL2, { liga: "hbl2", saison: "2026/27", spieltag: 6, jetzt: JETZT }).spiele).toHaveLength(3);
    const r = parseNdrSpieltag(HBL2, { liga: "hbl2", saison: "2026/27", spieltag: 20, jetzt: JETZT });
    expect(r.spiele).toHaveLength(0);
    expect(r.warnungen.join()).toMatch(/Spieltag 20/);
  });
});

describe("ndr: 1. HBL (Seite je Spieltag)", () => {
  const r = parseNdrSpieltag(HBL1, { liga: "hbl1", saison: "2026/27", spieltag: 2, jetzt: JETZT });
  it("liest HC Hamburg gegen TVB Stuttgart 34:34 (12:14)", () => {
    expect(r.spiele).toHaveLength(3);
    expect(r.spiele.find((x) => x.home.name === "HC Hamburg")).toMatchObject({ homeScore: 34, awayScore: 34, halftimeHomeScore: 12, halftimeAwayScore: 14, away: { name: "TVB Stuttgart" }, status: "finished", datum: "2026-09-10", spieltag: 2 });
    expect(r.spiele.find((x) => x.home.name === "MT Melsungen")).toMatchObject({ homeScore: 31, awayScore: 18, halftimeHomeScore: 14, halftimeAwayScore: 10 });
  });
  it("liest die Tabelle mit Beschriftungen und der Reihenfolge Tore, Differenz", () => {
    expect(r.tabelle[0]).toMatchObject({ rang: 1, name: "THW Kiel", spiele: 2, torePlus: 71, toreMinus: 55, tordifferenz: 16, punktePlus: 4, punkteMinus: 0 });
    expect(r.tabelle[1]).toMatchObject({ name: "HBW Balingen-Weilstetten", torePlus: 66, toreMinus: 53, tordifferenz: 13 });
  });
  it("findet die Navigationslinks der Seite selbst", () => {
    expect(parseNdrSeite(HBL1, { liga: "hbl1", saison: "2026/27", jetzt: JETZT }).navigation.map((n) => n.spieltag)).toEqual([1, 3]);
  });
  it("Seite ohne Spiele und Tabelle ist ein Layoutfehler", () => {
    expect(() => parseNdrSeite("<html><body><p>Nichts</p></body></html>", { liga: "hbl1", saison: "2026/27" })).toThrow(SportDeLayoutFehler);
  });
});
