// Tests der sport.de-Parser gegen NACHGEBAUTE Fixtures (siehe __fixtures__/README.md): Spielzeilen, Spieltagsseite (Spiele + Tabelle),
// Spielübersicht (Spielort/Ort), Liveticker (Stand + Ereignisse). Keine Personendaten.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLivetickerHtml, klassifiziereEreignis } from "./live-parser";
import { parseSpielUebersichtHtml } from "./match-parser";
import { parseSpieltagSeite } from "./schedule-parser";
import { istErlaubteLogoUrl, parseTabelleHtml } from "./standings-parser";
import { SportDeLayoutFehler } from "./types";
import { matchIdAusUrl, matchLinkAusHref, spieltagPfad, teamSlugAusHref } from "./urls";
import { loeseDatum, mappeStatus, parseSpielzeile } from "./zeile";

const fixture = (n: string) => readFileSync(path.join(__dirname, "__fixtures__", n), "utf8");
const SPIELTAG = fixture("spieltag-hbl2.html");
const UEBERSICHT = fixture("uebersicht.html");
const TICKER = fixture("liveticker.html");

describe("sport.de: URLs und IDs", () => {
  it("baut die Spieltagsadressen", () => {
    expect(spieltagPfad("hbl1", 1)).toBe("/handball/deutschland-hbl/md1/ergebnisse-und-tabelle/");
    expect(spieltagPfad("hbl2", 34)).toBe("/handball/deutschland-2-hbl/md34/ergebnisse-und-tabelle/");
  });
  it("liest Match-ID und Spielverzeichnis aus Links", () => {
    const l = matchLinkAusHref("https://www.sport.de/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/liveticker/?x=1");
    expect(l).toEqual({ externalMatchId: "ma11406368", ligaPfad: "/handball/deutschland-2-hbl/", pfad: "/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/" });
    expect(matchLinkAusHref("/handball/deutschland-hbl/ma99/uebersicht/")?.pfad).toBe("/handball/deutschland-hbl/ma99/");
    expect(matchLinkAusHref("/handball/deutschland-hbl/tabelle/")).toBeNull();
    expect(matchIdAusUrl("/handball/deutschland-2-hbl/ma11406368/x/uebersicht/")).toBe("ma11406368");
  });
  it("liest den Team-Slug nur aus Team-Links", () => {
    expect(teamSlugAusHref("/handball/mannschaft/tusem-essen/")).toBe("tusem-essen");
    expect(teamSlugAusHref("https://www.sport.de/handball/teams/hsg-wetzlar/spielplan/")).toBe("hsg-wetzlar");
    expect(teamSlugAusHref("/handball/deutschland-hbl/ma1/x/")).toBeNull();
  });
});

describe("sport.de: Spielzeilen", () => {
  it("liest ein beendetes Spiel mit Halbzeitstand", () => {
    expect(parseSpielzeile("04.10.2025 TuSEM Essen 31:32 TV Großwallstadt (16:17) Beendet")).toMatchObject({
      heim: "TuSEM Essen", gast: "TV Großwallstadt", heimTore: 31, gastTore: 32, halbzeitHeim: 16, halbzeitGast: 17, status: "finished", uhrzeit: null,
    });
  });
  it("Zahl zwischen den Namen ist bei geplanten Spielen die Uhrzeit, sonst das Ergebnis", () => {
    expect(parseSpielzeile("Dessau-Roßlauer HV | 19:30 | TV Emsdetten")).toMatchObject({ uhrzeit: "19:30", heimTore: null, status: null });
    expect(parseSpielzeile("11.10.2025 19:30 Uhr Dessau-Roßlauer HV - TV Emsdetten")).toMatchObject({ uhrzeit: "19:30", heimTore: null, heim: "Dessau-Roßlauer HV", gast: "TV Emsdetten" });
  });
  it("Ergebnis vor den Namen und Halbzeitstand ohne Klammern (Aufbau des Livetickers)", () => {
    expect(parseSpielzeile("31:32 | TuSEM Essen | TV Großwallstadt | 16:17 | Beendet")).toMatchObject({ heim: "TuSEM Essen", gast: "TV Großwallstadt", heimTore: 31, gastTore: 32, halbzeitHeim: 16, halbzeitGast: 17, status: "finished", uhrzeit: null });
  });
  it("erkennt laufende Spiele und Pause; Spielminute allein bedeutet live", () => {
    expect(parseSpielzeile("Eulen Ludwigshafen 22:20 ASV Hamm-Westfalen 2. Halbzeit 45'")).toMatchObject({ status: "live", minute: 45, heimTore: 22 });
    expect(parseSpielzeile("Eulen Ludwigshafen 22:20 ASV Hamm-Westfalen 45'")).toMatchObject({ status: "live", minute: 45 });
    expect(parseSpielzeile("VfL Eintracht Hagen 18:17 Bayer Dormagen (18:17) Pause")).toMatchObject({ status: "halftime", halbzeitHeim: 18 });
  });
  it("Namen mit Ziffern und Punkten bleiben ganz; mehr als zwei Namen sind keine Zeile", () => {
    expect(parseSpielzeile("TV 05/07 Hüttenberg 25:25 HSG Nordhorn-Lingen Beendet")).toMatchObject({ heim: "TV 05/07 Hüttenberg", gast: "HSG Nordhorn-Lingen" });
    expect(parseSpielzeile("1. VfL Potsdam 20:18 SG A/B Beendet")).toMatchObject({ heim: "1. VfL Potsdam", gast: "SG A/B" });
    expect(parseSpielzeile("A B C 20:18 Beendet")).toBeNull();
  });
  it("mappt Status defensiv: Unbekanntes wird nie 'finished'", () => {
    expect(mappeStatus("Beendet")).toBe("finished");
    expect(mappeStatus("Pause")).toBe("halftime");
    expect(mappeStatus("1. Halbzeit")).toBe("live");
    expect(mappeStatus("2. Halbzeit")).toBe("live");
    expect(mappeStatus("Abgesagt")).toBe("cancelled");
    expect(mappeStatus("Wertung offen")).toBeNull();
    expect(mappeStatus(null)).toBeNull();
  });
  it("löst Datum ohne Jahr nach der Saison auf", () => {
    expect(loeseDatum({ tag: 4, monat: 10, jahr: null }, 2025)).toBe("2025-10-04");
    expect(loeseDatum({ tag: 14, monat: 3, jahr: null }, 2025)).toBe("2026-03-14");
    expect(loeseDatum({ tag: 4, monat: 10, jahr: 2025 }, 2024)).toBe("2025-10-04");
    expect(loeseDatum({ tag: 31, monat: 13, jahr: null }, 2025)).toBeNull();
  });
});

describe("sport.de: Tabelle", () => {
  it("liest Platz, Tore, Differenz und Punkte (11:3) und nur die erste Tabelle", () => {
    const { zeilen, teams } = parseTabelleHtml(SPIELTAG, "hbl2");
    expect(zeilen).toHaveLength(4);
    expect(zeilen[0]).toMatchObject({ rang: 1, name: "SG BBM Bietigheim", teamId: "sg-bbm-bietigheim", spiele: 7, siege: 4, unentschieden: 3, niederlagen: 0, torePlus: 202, toreMinus: 189, tordifferenz: 13, punktePlus: 11, punkteMinus: 3, punkteRoh: "11:3" });
    expect(zeilen[3].tordifferenz).toBe(-10);
    expect(teams[0]).toMatchObject({ externalId: "sg-bbm-bietigheim", slug: "sg-bbm-bietigheim", league: "hbl2", logoUrl: "https://www.sport.de/img/logos/sg-bbm-bietigheim.png" });
    expect(zeilen.some((z) => z.name === "Eintracht Heim")).toBe(false);
  });
  it("fällt ohne Team-Link auf einen Namens-Schlüssel zurück (mit Warnung)", () => {
    const html = `<div><b>1</b><i>THW Kiel</i><i>7</i><i>7</i><i>0</i><i>0</i><i>230:180</i><i>+50</i><i>14:0</i></div>`;
    const r = parseTabelleHtml(html, "hbl1");
    expect(r.zeilen[0].teamId).toBe("name:thw-kiel");
    expect(r.warnungen[0]).toContain("kein Team-Link");
  });
  it("wirft bei unbekanntem Layout; Logos nur von sport.de", () => {
    expect(() => parseTabelleHtml("<table><tr><td>nichts</td></tr></table>", "hbl1")).toThrow(SportDeLayoutFehler);
    expect(istErlaubteLogoUrl("https://www.sport.de/x.png")).toBe(true);
    expect(istErlaubteLogoUrl("https://cdn.sport.de/x.png")).toBe(true);
    expect(istErlaubteLogoUrl("http://www.sport.de/x.png")).toBe(false);
    expect(istErlaubteLogoUrl("https://evil.example/x.png")).toBe(false);
    expect(istErlaubteLogoUrl("https://sport.de.evil.example/x.png")).toBe(false);
  });
});

describe("sport.de: Spieltagsseite", () => {
  const r = parseSpieltagSeite(SPIELTAG, { liga: "hbl2", saison: "2025/26", spieltag: 10 });
  const nachId = (id: string) => r.spiele.find((s) => s.externalMatchId === id)!;
  it("liest alle Spiele mit Match-ID als Schlüssel", () => {
    expect(r.spiele).toHaveLength(5);
    expect(r.warnungen).toEqual([]);
    expect(r.tabelle).toHaveLength(4);
  });
  it("beendetes Spiel: Ergebnis, Halbzeit, Datum aus der Überschrift, Team-Slugs über die Tabelle", () => {
    expect(nachId("ma11406368")).toMatchObject({
      spieltag: 10, datum: "2025-10-04", status: "finished", homeScore: 31, awayScore: 32, halftimeHomeScore: 16, halftimeAwayScore: 17,
      matchPfad: "/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/", sourceUrl: "https://www.sport.de/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/",
    });
    expect(nachId("ma11406368").home.externalId).toBe("tusem-essen");
    expect(nachId("ma11406368").away.name).toBe("TV Großwallstadt");
  });
  it("Pause, laufendes und geplantes Spiel", () => {
    expect(nachId("ma11406370")).toMatchObject({ status: "halftime", homeScore: 18, awayScore: 17, halftimeHomeScore: 18 });
    expect(nachId("ma11406371")).toMatchObject({ status: "live", minute: 45, homeScore: 22, awayScore: 20 });
    const geplant = nachId("ma11406372");
    expect(geplant).toMatchObject({ datum: "2025-10-11", uhrzeit: "19:30", status: null, homeScore: null });
    expect(geplant.startTime?.toISOString()).toBe("2025-10-11T17:30:00.000Z"); // 19:30 MESZ
  });
  it("Spiele ohne Unentschieden-Verwechslung: 25:25 bleibt ein Ergebnis", () => {
    expect(nachId("ma11406369")).toMatchObject({ homeScore: 25, awayScore: 25, status: "finished" });
  });
  it("wirft ohne Spiel-Links", () => {
    expect(() => parseSpieltagSeite("<html><body><h3>04.10.2025</h3></body></html>", { liga: "hbl2", saison: "2025/26", spieltag: 1 })).toThrow(SportDeLayoutFehler);
  });
});

describe("sport.de: Spielübersicht", () => {
  it("liefert den Testfall ma11406368 vollständig", () => {
    const s = parseSpielUebersichtHtml(UEBERSICHT, { liga: "hbl2", saison: "2025/26", externalMatchId: "ma11406368", pfad: "/handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/" });
    expect(s).toMatchObject({
      externalMatchId: "ma11406368", home: { name: "TuSEM Essen" }, away: { name: "TV Großwallstadt" }, homeScore: 31, awayScore: 32,
      halftimeHomeScore: 16, halftimeAwayScore: 17, status: "finished", spieltag: 10, datum: "2025-10-04", uhrzeit: "19:00",
      venue: "Sporthalle am Hallo", ort: "Essen",
    });
    expect(s.startTime?.toISOString()).toBe("2025-10-04T17:00:00.000Z");
  });
  it("wirft ohne Spielkopf", () => {
    expect(() => parseSpielUebersichtHtml("<html><body><p>Wartung</p></body></html>", { liga: "hbl2", saison: "2025/26", externalMatchId: "ma1", pfad: null })).toThrow(SportDeLayoutFehler);
  });
});

describe("sport.de: Liveticker", () => {
  const stand = parseLivetickerHtml(TICKER, "ma11406368");
  it("liest Stand, Status und Halbzeitstand", () => {
    expect(stand).toMatchObject({ externalMatchId: "ma11406368", status: "finished", homeScore: 31, awayScore: 32, halftimeHomeScore: 16, halftimeAwayScore: 17 });
  });
  it("liest die Ereignisse mit Minute, ohne Spielernamen", () => {
    expect(stand.events).toHaveLength(8);
    expect(stand.events[0]).toMatchObject({ minute: 60, type: "match_end" });
    expect(stand.events[1]).toMatchObject({ minute: 59, type: "goal", team: "TV Großwallstadt", homeScore: 31, awayScore: 32 });
    expect(stand.events.every((e) => e.player === undefined)).toBe(true);
  });
  it("klassifiziert Tore, 7-Meter, 2-Minuten-Strafen und Halbzeiten", () => {
    const typen = Object.fromEntries(stand.events.map((e) => [e.minute, e.type]));
    expect(typen[47]).toBe("two_minute");
    expect(typen[40]).toBe("seven_meter_goal");
    expect(typen[39]).toBe("seven_meter_missed");
    expect(typen[31]).toBe("half_start");
    expect(typen[30]).toBe("half_end");
    expect(klassifiziereEreignis("Rote Karte für Beispiel").type).toBe("red_card");
    expect(klassifiziereEreignis("Anpfiff").type).toBe("match_start");
    expect(klassifiziereEreignis("Auszeit TuSEM Essen").type).toBe("other");
  });
  it("Platzhalter-Spielernamen tauchen in keiner Zwischenform auf", () => {
    const { spiele, tabelle, teams } = parseSpieltagSeite(SPIELTAG, { liga: "hbl2", saison: "2025/26", spieltag: 10 });
    const alles = JSON.stringify([spiele, tabelle, teams, stand.events.map((e) => ({ ...e, text: undefined }))]);
    expect(alles).not.toContain("Beispielspieler");
  });
});
