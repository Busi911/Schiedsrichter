import type { SportDeLiga } from "../match";
import { alleMit, attr, nachfahren, parseHtml, textGetrennt, textInhalt, type Knoten } from "./html";
import { SPORTDE_PROFIL, type ParserProfil } from "./profil";
import { logoAusKnoten, parseTabelleHtml } from "./standings-parser";
import { deuteSpielzeile, loeseDatum, saisonStartJahr, startZeit, zerlege, type Spielzeile } from "./zeile";
import { teamIdAusNamen } from "./urls";
import { SportDeLayoutFehler, type SportDeSpiel, type SportDeTabellenzeile, type SportDeTeam } from "./types";

// Eine Spieltagsseite (…/md{n}/ergebnisse-und-tabelle/): Begegnungen UND Tabelle. Begegnungen werden über ihre Links erkannt
// (href mit /ma<ID>/), die sichtbare Zeile des Spiels (Heim, Ergebnis/Uhrzeit, Gast, Status, Datum) über den Text der Zeile —
// kein nth-child, keine CSS-Klassen. Was nicht eindeutig lesbar ist, wird gemeldet statt geraten.

function anzahlSpielLinks(k: Knoten, profil: ParserProfil): number {
  return new Set(alleMit(k, "a").map((a) => profil.matchLink(attr(a, "href") ?? "")?.externalMatchId).filter(Boolean)).size;
}

export function parseSpieltagSeite(
  html: string,
  k: { liga: SportDeLiga; saison: string; spieltag: number },
  profil: ParserProfil = SPORTDE_PROFIL
): { spiele: SportDeSpiel[]; tabelle: SportDeTabellenzeile[]; teams: SportDeTeam[]; warnungen: string[] } {
  const start = saisonStartJahr(k.saison);
  const warnungen: string[] = [];
  let tabelle: SportDeTabellenzeile[] = [];
  let teams: SportDeTeam[] = [];
  try {
    const t = parseTabelleHtml(html, k.liga, profil);
    tabelle = t.zeilen;
    teams = t.teams;
    warnungen.push(...t.warnungen);
  } catch (err) {
    warnungen.push(err instanceof Error ? err.message : String(err));
  }
  const namensIndex = new Map(teams.map((t) => [normalisiere(t.name), t]));

  const wurzel = parseHtml(html);
  const spiele = new Map<string, SportDeSpiel>();
  let links = 0;
  let nichtLesbar = 0;
  let datumUeberschrift: string | null = null;

  for (const n of nachfahren(wurzel)) {
    if (n.tag !== "a") {
      // Datumsüberschrift: ein Element, dessen ganzer Text nur ein Datum ist (und das kein Spiel enthält)
      if (anzahlSpielLinks(n, profil) === 0 && textInhalt(n).length <= 40) {
        const teile = zerlege(textInhalt(n));
        if (teile.length === 1 && teile[0].art === "datum") datumUeberschrift = loeseDatum(teile[0], start) ?? datumUeberschrift;
      }
      continue;
    }
    const link = profil.matchLink(attr(n, "href") ?? "");
    if (!link) continue;
    links++;

    // Zeile: der Link selbst und seine Vorfahren, solange sie nur dieses eine Spiel enthalten. Es gewinnt die UMFASSENDSTE lesbare Zeile:
    // erst mit Status, Halbzeitstand und Datum lässt sich ein "18:17" sicher als Ergebnis oder Uhrzeit deuten.
    let zeile: Spielzeile | null = null;
    let kontext: Knoten | null = null;
    for (let k2: Knoten | null = n, i = 0; k2 && i < 6; k2 = k2.eltern, i++) {
      if (anzahlSpielLinks(k2, profil) > 1) break;
      const z = profil.deute ? profil.deute(k2) : deuteSpielzeile(zerlege(textGetrennt(k2)));
      if (z) {
        zeile = z;
        kontext = k2;
      }
    }
    if (zeile && zeile.heimTore === null && !zeile.uhrzeit && !zeile.status) zeile = null;
    if (!zeile || !kontext) {
      if (!spiele.has(link.externalMatchId)) {
        nichtLesbar++;
        warnungen.push(`Spiel ${link.externalMatchId}: Zeile nicht lesbar`);
      }
      continue;
    }
    const datum = (zeile.datum ? loeseDatum(zeile.datum, start) : null) ?? datumUeberschrift;
    if (!datum) {
      warnungen.push(`Spiel ${link.externalMatchId}: Datum nicht lesbar`);
      nichtLesbar++;
      continue;
    }
    // Team-IDs: Team-Links der Zeile (Reihenfolge Heim, Gast), sonst über den Namen aus der Tabelle, sonst Ersatzschlüssel aus dem Namen.
    // (Hinter Name UND Kürzel kann derselbe Link stehen: aufeinanderfolgende Wiederholungen zählen einmal.)
    const teamLinks = alleMit(kontext, "a")
      .map((a) => profil.teamKennung(attr(a, "href") ?? "")?.id)
      .filter((s, i, liste): s is string => !!s && s !== liste[i - 1]);
    const heimTeam = namensIndex.get(normalisiere(zeile.heim));
    const gastTeam = namensIndex.get(normalisiere(zeile.gast));
    const logos = logoAusKnoten(kontext, profil);
    const neu: SportDeSpiel = {
      externalMatchId: link.externalMatchId,
      matchPfad: link.pfad,
      spieltag: zeile.spieltag ?? k.spieltag,
      datum,
      uhrzeit: zeile.uhrzeit,
      startTime: startZeit(datum, zeile.uhrzeit),
      status: zeile.status,
      minute: zeile.minute,
      home: { externalId: teamLinks[0] ?? heimTeam?.externalId ?? teamIdAusNamen(zeile.heim), name: zeile.heim, logoUrl: heimTeam?.logoUrl ?? logos.url },
      away: { externalId: teamLinks[1] ?? gastTeam?.externalId ?? teamIdAusNamen(zeile.gast), name: zeile.gast, logoUrl: gastTeam?.logoUrl ?? null },
      homeScore: zeile.heimTore,
      awayScore: zeile.gastTore,
      halftimeHomeScore: zeile.halbzeitHeim,
      halftimeAwayScore: zeile.halbzeitGast,
      venue: null,
      ort: null,
      sourceUrl: profil.vollUrl(link.pfad),
    };
    // Ein Spiel kann mehrfach verlinkt sein (Übersicht, Liveticker): die vollständigere Lesung gewinnt.
    const alt = spiele.get(link.externalMatchId);
    if (!alt || punkte(neu) > punkte(alt)) spiele.set(link.externalMatchId, neu);
  }
  if (links === 0) throw new SportDeLayoutFehler(profil.name, "keine Spiel-Links (…/ma<ID>/…) gefunden");
  if (spiele.size === 0 || nichtLesbar > links / 2) throw new SportDeLayoutFehler(profil.name, `${nichtLesbar} von ${links} Spielen nicht lesbar`);
  return { spiele: [...spiele.values()], tabelle, teams, warnungen };
}

const punkte = (s: SportDeSpiel) => Number(s.homeScore !== null) + Number(!!s.uhrzeit) + Number(!!s.status) + Number(s.halftimeHomeScore !== null);
const normalisiere = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "");
