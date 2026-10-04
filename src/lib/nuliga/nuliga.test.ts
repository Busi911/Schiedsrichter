import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseClubTeams } from "./parsers/club-teams";
import { parseFreundschaftsGruppe } from "./parsers/freundschaft";
import { parseGroupPage } from "./parsers/group-page";
import { parseTeamPortrait } from "./parsers/team-portrait";
import { parseSpielTabellen } from "./parsers/spielzeilen";
import {
  istRegulaererWettbewerb,
  normalisiereMannschaft,
  parseLigaName,
  saisonAusChampionship,
} from "./normalisierung";
import { paramsAusUrl } from "./html";

const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");

// Platzhalter-Namen aus den Fixtures (siehe __fixtures__/README.md): dürfen
// in KEINEM Parser-Ergebnis auftauchen.
const PERSONEN = ["Mustermann", "Beispiel, Erika", "Must.", "GEHEIMER-TOKEN"];
const keinePersonen = (daten: unknown) => {
  const json = JSON.stringify(daten);
  for (const p of PERSONEN) expect(json).not.toContain(p);
};

describe("paramsAusUrl", () => {
  it("dekodiert nuLiga-Parameter inkl. &amp; und +", () => {
    const p = paramsAusUrl("/x/groupPage?championship=Gie%C3%9Fen+26%2F27&amp;group=491948");
    expect(p.get("championship")).toBe("Gießen 26/27");
    expect(p.get("group")).toBe("491948");
  });
});

describe("Wettbewerbs-Erkennung", () => {
  it("erkennt reguläre Saisons, schließt FS/Quali/Cups aus", () => {
    expect(istRegulaererWettbewerb("Gießen 26/27")).toBe(true);
    expect(istRegulaererWettbewerb("HHV 26/27")).toBe(true);
    expect(istRegulaererWettbewerb("Gießen FS 26/27")).toBe(false);
    expect(istRegulaererWettbewerb("Odenwald-Spessart FrSp 26/27")).toBe(false);
    expect(istRegulaererWettbewerb("Gießen Quali 26/27")).toBe(false);
    expect(istRegulaererWettbewerb("Deutschland-Cup 2026")).toBe(false);
    expect(saisonAusChampionship("Gießen 26/27")).toBe("2026/27");
  });
});

describe("normalisiereMannschaft", () => {
  const fall: [string, string, string, string][] = [
    // [nuLiga-Name, kategorie, slug, anzeigename]
    ["Männer", "herren", "maenner", "Männer"],
    ["Männer II", "herren", "maenner-2", "Männer II"],
    ["Frauen", "damen", "frauen", "Frauen"],
    ["männliche Jugend A", "jugend_maennlich", "maennliche-a", "männliche Jugend A"],
    ["männliche Jugend C II", "jugend_maennlich", "maennliche-c-2", "männliche Jugend C II"],
    ["weibliche Jugend B", "jugend_weiblich", "weibliche-b", "weibliche Jugend B"],
    ["Jugend F - Maxi 4+1 II", "kinder", "f-maxi-2", "F-Jugend Maxi II"],
    ["Jugend F - Midi 4+1 III", "kinder", "f-midi-3", "F-Jugend Midi III"],
    ["Jugend F - Mini 4+1 IV", "kinder", "f-mini-4", "F-Jugend Mini IV"],
    ["Männer/männlich 2", "herren", "maenner-2", "Männer II"],
  ];
  it.each(fall)("%s", (name, kategorie, slug, anzeige) => {
    const n = normalisiereMannschaft(name);
    expect(n.kategorie).toBe(kategorie);
    expect(n.slug).toBe(slug);
    expect(n.anzeigename).toBe(anzeige);
  });

  it("markiert 'entfällt:' und behält die Kategorie", () => {
    const n = normalisiereMannschaft("entfällt: Jugend F - Maxi 2x3gg3");
    expect(n.entfaellt).toBe(true);
    expect(n.kategorie).toBe("kinder");
  });

  it("fällt auf den Liga-Text zurück und sonst auf 'sonstige'", () => {
    expect(normalisiereMannschaft("Team X", "männliche D-Jugend Bezirksliga").slug).toBe("maennliche-d");
    const sonstige = normalisiereMannschaft("Seniorenmannschaft");
    expect(sonstige.kategorie).toBe("sonstige");
    expect(sonstige.slug).toBe("seniorenmannschaft");
  });

  it("liefert einen saison-unabhängigen Schlüssel", () => {
    expect(normalisiereMannschaft("männliche Jugend C II").schluessel).toBe("jugend_maennlich:C::2");
  });
});

describe("parseLigaName", () => {
  it("zerlegt Geschlecht, Altersklasse, Spielklasse, Gruppe", () => {
    expect(parseLigaName("männliche D-Jugend Bezirksklasse - Gr.2")).toMatchObject({
      geschlecht: "m",
      altersklasse: "D",
      spielklasse: "Bezirksklasse",
      gruppe: "Gr.2",
      istMeldeliste: false,
    });
    expect(parseLigaName("männliche E-Jugend 2.Bezirksklasse Gr.2")).toMatchObject({
      altersklasse: "E",
      spielklasse: "2.Bezirksklasse",
      gruppe: "Gr.2",
    });
    expect(parseLigaName("männliche E-Jugend Bezirksliga (NEU)")).toMatchObject({
      spielklasse: "Bezirksliga",
    });
    expect(parseLigaName("Männer Bezirksoberliga")).toMatchObject({
      geschlecht: "m",
      altersklasse: null,
      spielklasse: "Bezirksoberliga",
    });
    expect(parseLigaName("Meldeliste Maxi 4+1")).toMatchObject({
      istMeldeliste: true,
      spielklasse: null,
    });
  });
});

describe("parseClubTeams", () => {
  const { daten, warnungen } = parseClubTeams(fixture("club-teams.html"));

  it("liest Verein und Club-ID", () => {
    expect(daten.vereinsname).toBe("TSF Heuchelheim");
    expect(daten.clubId).toBe("69723");
    expect(warnungen).toEqual([]);
  });

  it("trennt reguläre Saison von Freundschaftsspielen/Quali", () => {
    const regulaer = daten.teams.filter((t) => t.regulaer);
    expect(regulaer).toHaveLength(8);
    expect(daten.teams.filter((t) => !t.regulaer)).toHaveLength(2);
    expect(regulaer.every((t) => t.saison === "2026/27")).toBe(true);
  });

  it("liest Gruppe, Liga, Rang und Punkte", () => {
    const maenner = daten.teams.find((t) => t.mannschaftsname === "Männer")!;
    expect(maenner).toMatchObject({
      gruppenId: "491948",
      championship: "Gießen 26/27",
      ligaName: "Männer Bezirksoberliga",
      rang: 5,
      punkte: { plus: 4, minus: 2 },
    });
  });

  it("liest keine Personendaten (Mannschaftsverantwortliche)", () => {
    keinePersonen(daten);
  });

  it("meldet HTML-Drift als Warnung statt zu werfen", () => {
    expect(parseClubTeams("<html><body>leer</body></html>").warnungen.length).toBeGreaterThan(0);
  });
});

describe("parseGroupPage", () => {
  const { daten, warnungen } = parseGroupPage(fixture("group-page.html"));

  it("liest Gruppe und Liga aus Metadaten/Überschrift", () => {
    expect(warnungen).toEqual([]);
    expect(daten.gruppenId).toBe("492633");
    expect(daten.championship).toBe("Gießen 26/27");
    expect(daten.liga).toMatchObject({ altersklasse: "D", gruppe: "Gr.2" });
  });

  it("liest die Tabelle inkl. teamtable-IDs aller Teams", () => {
    expect(daten.tabelle).toHaveLength(4);
    expect(daten.tabelle[2]).toMatchObject({
      rang: 3,
      mannschaft: "mJSG Heuchelheim/Bieber II",
      teamtableId: "2242017",
      spiele: 1,
      siege: 1,
      tore: { plus: 33, minus: 15 },
      punkte: { plus: 2, minus: 0 },
    });
  });

  it("übernimmt keine Schiedsrichter-Angaben aus noch offenen Spielen", () => {
    keinePersonen(daten);
    const offen = daten.spiele.filter((s) => s.status === "geplant");
    expect(offen).toHaveLength(2);
    expect(offen.every((s) => s.tore === null)).toBe(true);
  });

  it("führt das Datum über Folgezeilen (rowspan) mit", () => {
    const zweites = daten.spiele.find((s) => s.spielnummer === 11)!;
    expect(zweites.datum).toBe("2026-10-24");
  });
});

describe("parseTeamPortrait", () => {
  const { daten, warnungen } = parseTeamPortrait(fixture("team-portrait.html"));

  it("liest IDs aus den Metadaten und den Verein aus dem Link", () => {
    expect(warnungen).toEqual([]);
    expect(daten).toMatchObject({
      teamtableId: "2208495",
      gruppenId: "491948",
      championship: "Gießen 26/27",
      clubId: "69723",
      vereinsname: "TSF Heuchelheim",
      mannschaftsname: "TSF Heuchelheim 1. Männer",
    });
  });

  it("liest den Tabellenstand aus dem Freitext", () => {
    expect(daten.tabellenstand).toEqual({
      rang: 5,
      punkte: { plus: 4, minus: 2 },
      tore: { plus: 91, minus: 83 },
      siege: 2,
      unentschieden: 0,
      niederlagen: 1,
    });
  });

  it("liest Spiele: Ergebnis, Meeting-ID, Halle, Zeit in Berliner Ortszeit", () => {
    const gespielt = daten.spiele[0];
    expect(gespielt).toMatchObject({
      spielnummer: 5,
      meetingId: "8262491",
      gruppenId: "491948",
      datum: "2026-09-12",
      uhrzeit: "19:30",
      heim: "TSF Heuchelheim",
      gast: "HSG Linden II",
      tore: { plus: 33, minus: 28 },
      halbzeit: { plus: 14, minus: 13 },
      ergebnisBestaetigt: true,
      status: "gespielt",
      halle: { name: "Sporthalle Heuchelheim", nummer: "14137", nuligaId: "30402" },
    });
    // 19:30 MESZ = 17:30 UTC
    expect(gespielt.beginn?.toISOString()).toBe("2026-09-12T17:30:00.000Z");
  });

  it("kennzeichnet vorläufige Ergebnisse (ohne 'Spielbericht genehmigt')", () => {
    const s = daten.spiele.find((x) => x.spielnummer === 20)!;
    expect(s.tore).toEqual({ plus: 26, minus: 29 });
    expect(s.ergebnisBestaetigt).toBe(false);
  });

  it("erkennt verlegte Spiele samt ursprünglichem Termin", () => {
    const s = daten.spiele.find((x) => x.spielnummer === 48)!;
    expect(s.status).toBe("verlegt");
    expect(s.uhrzeit).toBe("20:00");
    expect(s.urspruenglicherBeginn?.toISOString()).toBe("2026-10-31T19:15:00.000Z");
  });

  it("liest das Kalender-Token nicht", () => {
    keinePersonen(daten);
  });
});

describe("parseSpielTabellen: Sonderfälle", () => {
  const { spiele } = parseSpielTabellen(fixture("spielzeilen-sonderfaelle.html"));

  it("erkennt Absage + 'nicht angetreten' (x/NH) statt die Zeile zu verwerfen", () => {
    expect(spiele[0]).toMatchObject({ spielnummer: 13, status: "nicht_angetreten", tore: null });
  });

  it("liest ein Ergebnis ohne Halbzeitstand (Wertung)", () => {
    expect(spiele[1]).toMatchObject({
      status: "gespielt",
      tore: { plus: 2, minus: 0 },
      halbzeit: null,
      meetingId: "8381082",
      gruppenId: "492078",
    });
  });

  it("behandelt fehlende Uhrzeit als offen (beginn = null)", () => {
    expect(spiele[2]).toMatchObject({ uhrzeit: null, beginn: null, datum: "2026-09-28" });
  });
});

describe("parseSpielTabellen: 0:0", () => {
  const zeile = (ergebnis: string, genehmigt = false) => `<html><body><table class="result-set">
    <tr><th>Tag</th><th>Datum</th><th>Zeit</th><th>Ort</th><th>Nr.</th><th>Heimmannschaft</th><th>Gastmannschaft</th><th>Ergebnis</th><th>Info</th></tr>
    <tr><td>Sa.</td><td>03.10.2026</td><td>16:00</td><td></td><td>7</td><td>TSV Heim</td><td>TSV Gast</td><td><a href="x?MeetingReport=1&amp;meeting=5&amp;group=9" title="Spielbericht">${ergebnis}</a></td><td>${genehmigt ? "Spielbericht genehmigt" : ""}</td></tr>
  </table></body></html>`;

  it("0:0 ohne genehmigten Spielbericht ist nur der Platzhalter vor dem Spiel (noch kein Ergebnis)", () => {
    const { spiele } = parseSpielTabellen(zeile("0:0"));
    expect(spiele[0]).toMatchObject({ spielnummer: 7, tore: null, status: "geplant", ergebnisBestaetigt: false });
  });

  it("0:0 mit genehmigtem Spielbericht (z.B. Nichtantritt) ist ein echtes Ergebnis", () => {
    const { spiele } = parseSpielTabellen(zeile("0:0", true));
    expect(spiele[0]).toMatchObject({ tore: { plus: 0, minus: 0 }, status: "gespielt", ergebnisBestaetigt: true });
  });

  it("ein normales Ergebnis bleibt erhalten", () => {
    const { spiele } = parseSpielTabellen(zeile("29:36"));
    expect(spiele[0]).toMatchObject({ tore: { plus: 29, minus: 36 }, status: "gespielt" });
  });
});

describe("parseGroupPage: zurückgezogene Mannschaft", () => {
  it("erkennt 'zurückgezogen am …' statt Statistik", () => {
    const html = `<html><body><table class="result-set">
      <tr><th>Rang</th><th>Mannschaft</th><th>Begegnungen</th><th>S</th><th>U</th><th>N</th><th>Tore</th><th>+/-</th><th>Punkte</th></tr>
      <tr><td>1</td><td><a href="/x/teamPortrait?teamtable=11&amp;group=5">TSV Beispiel</a></td><td>3</td><td>3</td><td>0</td><td>0</td><td>88:67</td><td>+21</td><td>6:0</td></tr>
      <tr><td>10</td><td><a href="/x/teamPortrait?teamtable=22&amp;group=5">HSG Muster II</a></td><td colspan="6">zurückgezogen am 09.07.2026</td></tr>
    </table></body></html>`;
    const { daten } = parseGroupPage(html);
    expect(daten.tabelle.map((z) => [z.mannschaft, z.teamtableId, z.zurueckgezogen])).toEqual([
      ["TSV Beispiel", "11", false],
      ["HSG Muster II", "22", true],
    ]);
  });
});

describe("Freundschaftsspiel-Gruppe", () => {
  const html = readFileSync(path.join(import.meta.dirname, "__fixtures__", "freundschaft-gruppe.html"), "utf8");
  it("liest Titel, Teilnehmer und das eine Spiel (Nr. 0, Halle, Ergebnis)", () => {
    const { daten } = parseFreundschaftsGruppe(html);
    expect(daten.gruppenId).toBe("522635");
    expect(daten.championship).toBe("Gießen FS 26/27");
    expect(daten.titel).toBe("Freundschaftsspiel 2026-08-29 M TSF Heuchelheim (BOL) gg TV Altenhaßlau (BOL)");
    expect(daten.teams).toEqual([
      { name: "TSF Heuchelheim 1", teamtableId: "2260175" },
      { name: "TV Altenhaßlau 1", teamtableId: "2260176" },
    ]);
    expect(daten.spiele).toHaveLength(1);
    expect(daten.spiele[0]).toMatchObject({
      spielnummer: 0,
      datum: "2026-08-29",
      uhrzeit: "16:00",
      heim: "TSF Heuchelheim 1",
      gast: "TV Altenhaßlau 1",
      meetingId: "8460431",
      status: "gespielt",
      halle: { name: "Sporthalle Heuchelheim", nuligaId: "30402" },
    });
    expect(daten.spiele[0].tore).toEqual({ plus: 29, minus: 26 });
  });
  it("das Mannschaftsportrait liefert Verein und Mannschaftsname", () => {
    const portrait = readFileSync(path.join(import.meta.dirname, "__fixtures__", "freundschaft-portrait.html"), "utf8");
    const { daten } = parseTeamPortrait(portrait);
    expect(daten.clubId).toBe("69723");
    expect(daten.teamtableId).toBe("2260175");
    expect(daten.mannschaftsname).toContain("1.");
  });
});
