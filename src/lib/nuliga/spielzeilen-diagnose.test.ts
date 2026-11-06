import { describe, expect, it } from "vitest";
import { parseSpielTabellen } from "./parsers/spielzeilen";

// Synthetische Tabellen (kein echtes nuLiga-HTML der betroffenen E-Jugend-Teams vorhanden):
// prüfen nur das Verhalten des Parsers für belegbare Fehlerfälle.
function tabelle(kopf: string[], zeilen: string[][]): string {
  const k = `<tr>${kopf.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  const z = zeilen.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table>${k}${z}</table>`;
}
const KOPF = ["Tag", "Datum", "Zeit", "Ort", "Nr.", "Heimmannschaft", "Gastmannschaft", "Ergebnis"];
const zeile = (nr: string, ergebnis = "") => ["Sa.", "10.10.2026", "10:00", "", nr, "A", "B", ergebnis];

describe("parseSpielTabellen: Diagnose", () => {
  it("zählt Köpfe, Kandidaten und Spielnummern", () => {
    const { spiele, diagnose } = parseSpielTabellen(tabelle(KOPF, [zeile("17"), zeile("29")]));
    expect(spiele.map((s) => s.spielnummer)).toEqual([17, 29]);
    expect(diagnose).toMatchObject({ tabellen: 1, erkannteTabellen: 1, kandidaten: 2, mitSpielnummer: 2 });
    expect(diagnose.koepfe[0]).toContain("heimmannschaft");
  });

  it("geschütztes Leerzeichen um die Nummer stört nicht", () => {
    const { spiele } = parseSpielTabellen(tabelle(KOPF, [zeile("&nbsp;17&nbsp;")]));
    expect(spiele[0].spielnummer).toBe(17);
  });

  it("leere Nummer -> null und gezählt; nicht numerische Nummer wird NICHT geraten", () => {
    const { spiele, diagnose } = parseSpielTabellen(tabelle(KOPF, [zeile(""), zeile("SF 3"), zeile("5")]));
    expect(spiele.map((s) => s.spielnummer)).toEqual([null, null, 5]);
    expect(diagnose).toMatchObject({ ohneSpielnummer: 1, ungueltigeSpielnummer: 1, mitSpielnummer: 1 });
  });

  it("erkennt die Kopf-Aliasse Heim/Gast", () => {
    const kopf = KOPF.map((h) => h.replace("mannschaft", ""));
    expect(parseSpielTabellen(tabelle(kopf, [zeile("1")])).spiele).toHaveLength(1);
  });

  it("meldet Tabellen ohne Spielplan-Köpfe mit Kopfzeile statt still zu schweigen", () => {
    const { spiele, diagnose } = parseSpielTabellen(tabelle(["Datum", "Zeit", "Teilnehmer"], [["10.10.2026", "10:00", "X"]]));
    expect(spiele).toHaveLength(0);
    expect(diagnose).toMatchObject({ tabellen: 1, erkannteTabellen: 0 });
    expect(diagnose.koepfe).toEqual([["datum", "zeit", "teilnehmer"]]);
  });

  it("liest die Meeting-ID aus einem Spielbericht-Link der Zeile", () => {
    const link = `<a href="/wa/groupMeetingReport?group=492216&amp;meeting=8255735">x</a>`;
    const z = zeile("17");
    z.splice(3, 1, link);
    const { spiele, diagnose } = parseSpielTabellen(tabelle(KOPF, [z]));
    expect(spiele[0].meetingId).toBe("8255735");
    expect(diagnose.mitMeetingId).toBe(1);
  });

  it("colspan/rowspan verschieben die Spalten nicht", () => {
    const html = `<table><tr><th>Tag</th><th>Datum</th><th>Zeit</th><th>Ort</th><th>Nr.</th><th>Heimmannschaft</th><th>Gastmannschaft</th><th>Ergebnis</th></tr>
      <tr><td rowspan="2">Sa.</td><td rowspan="2">10.10.2026</td><td>10:00</td><td colspan="1"></td><td>1</td><td>A</td><td>B</td><td></td></tr>
      <tr><td>11:00</td><td></td><td>2</td><td>C</td><td>D</td><td></td></tr></table>`;
    const { spiele } = parseSpielTabellen(html);
    expect(spiele.map((s) => [s.spielnummer, s.datum, s.uhrzeit, s.heim])).toEqual([
      [1, "2026-10-10", "10:00", "A"],
      [2, "2026-10-10", "11:00", "C"],
    ]);
  });

  it("geerbtes Datum gilt nicht über Tabellen hinweg", () => {
    const zweite = tabelle(KOPF, [["", "", "09:00", "", "9", "E", "F", ""]]);
    const { spiele, diagnose } = parseSpielTabellen(tabelle(KOPF, [zeile("1")]) + zweite);
    expect(spiele).toHaveLength(1);
    expect(diagnose.verworfen["ohne Datum"]).toBe(1);
  });
});

// Staffel ohne Tabelle (E-Jugend, 06.11.2026 per Diagnose belegt): Tabellen "Raster | WR | Mannschaft" und Spielplan.
describe("parseGroupPage: Staffel ohne Tabelle", () => {
  const html = `<html><head><meta name="nuLigaStatsUrl" content="/x?championship=Hanau+26%2F27&amp;group=491869"></head><body>
    <h1>Hanau 26/27<br/>männliche Jugend E Gr.1<br/>Spielplan</h1>
    <table><tr><th>Raster</th><th>WR</th><th>Mannschaft</th><th></th></tr>
      <tr><td>1</td><td></td><td><a href="/wa/teamPortrait?teamtable=111&amp;group=491869">HSG Datterode/Röhrda/Sontra</a></td><td></td></tr>
      <tr><td>2</td><td></td><td><a href="/wa/teamPortrait?teamtable=222&amp;group=491869">TV Beispiel</a></td><td></td></tr></table>
    ${tabelle(KOPF, [zeile("1")])}</body></html>`;

  it("liefert die Teilnehmer mit teamtable-ID statt einer leeren Tabelle ohne Hinweis", async () => {
    const { parseGroupPage } = await import("./parsers/group-page");
    const { daten, warnungen } = parseGroupPage(html);
    expect(daten.tabelle).toHaveLength(0);
    expect(daten.teilnehmer).toEqual([
      { name: "HSG Datterode/Röhrda/Sontra", teamtableId: "111" },
      { name: "TV Beispiel", teamtableId: "222" },
    ]);
    expect(daten.spiele).toHaveLength(1);
    expect(warnungen).toContain("Keine Tabelle, 2 Teilnehmer ohne Wertung");
  });

  it("ordnet die Mannschaft über den Namen zu (rang 0 passt nie auf den Stand)", async () => {
    const { ermittleTeamtable } = await import("./sync-hilfen");
    const zeilen = [
      { rang: 0, mannschaft: "HSG Datterode/Röhrda/Sontra", teamtableId: "111" },
      { rang: 0, mannschaft: "TV Beispiel", teamtableId: "222" },
    ].map((z) => ({ ...z, spiele: null, siege: null, unentschieden: null, niederlagen: null, tore: null, punkte: null }));
    expect(ermittleTeamtable({ rang: 7, punkte: { plus: 0, minus: 8 }, nummer: 1 }, zeilen, "HSG Datterode/Röhrda/Sontra")).toBe("111");
    expect(ermittleTeamtable({ rang: null, punkte: null, nummer: 1 }, zeilen, "Fremder Verein")).toBeNull();
  });
});
