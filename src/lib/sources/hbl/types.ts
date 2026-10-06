import type { HblWettbewerb, MatchStatus } from "../match";

// Typen der HBL-Quelle (https://www.opel-hbl.de, Daten von Sportradar). Das ist die ZWISCHENFORM, die der Parser aus
// den öffentlichen Antworten der HBL-Seite erzeugt — und zugleich eine WHITELIST: was hier kein Feld hat, wird nie
// gelesen und nie gespeichert (die Antworten können Personendaten enthalten: Schiedsrichter, Spieler, Offizielle).
// Verwendet wird NUR die öffentliche Seite, nie die private Sportradar-Plattform/DataCore-API.

export type HblTeam = {
  externalId: string; // Team-UUID aus /de/team/<Code>/<UUID>
  code: string | null; // z.B. "THW"
  name: string;
  shortName: string | null;
  logoUrl: string | null; // nur aus dem HTML der öffentlichen HBL-Seite (Host images.dc.connect.sportradar.com), nie konstruiert
  league: "hbl1" | "hbl2";
  sourceUrl: string | null;
};

export type HblSpiel = {
  externalMatchId: string; // Spiel-UUID aus /de/match/<UUID> — primärer externer Schlüssel
  datum: string; // yyyy-mm-dd (deutsche Ortszeit)
  uhrzeit: string | null; // HH:MM; beendete Spiele zeigen die Uhrzeit auf der Spielplanseite nicht
  startTime: Date | null; // nur mit Uhrzeit bekannt
  status: MatchStatus | null; // aus dem sichtbaren Text ("Beendet", "Live"); null = künftig/unbekannt (gilt als geplant)
  matchday: number | null;
  home: { externalId: string; name: string; shortName: string | null };
  away: { externalId: string; name: string; shortName: string | null };
  homeScore: number | null;
  awayScore: number | null;
  halftimeHomeScore: number | null;
  halftimeAwayScore: number | null;
  venue: string | null;
};

export type HblTabellenzeile = {
  teamId: string;
  name: string;
  rang: number;
  spiele: number | null;
  siege: number | null;
  unentschieden: number | null;
  niederlagen: number | null;
  torePlus: number | null;
  toreMinus: number | null;
  punktePlus: number | null;
  punkteMinus: number | null;
};

// Stand eines Spiels laut öffentlicher Spielseite (für den einfachen Live-Stand; Ereignisse folgen später).
export type HblLiveStand = {
  externalMatchId: string;
  status: MatchStatus | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type HblAbfrage = { wettbewerb: HblWettbewerb; saison: string };

// Referenz Name <-> UUID für die Zuordnung der Spielplan-/Tabellenzeilen (aus Teams- und Tabellenseite).
export type HblTeamRef = { externalId: string; name: string };

// Öffentliche HTML-Seiten (relativ zu https://www.opel-hbl.de). Für DHB-Pokal und Super Cup sind keine Adressen bekannt.
export type HblEndpunkte = {
  teams(a: HblAbfrage): string;
  spielplan(a: HblAbfrage): string;
  tabelle(a: HblAbfrage): string;
  spiel(externalMatchId: string): string;
};

// Aus dem HTML der Seiten entstehen die Zwischenformen. Zeilen, die nicht eindeutig lesbar sind, werden nie geraten,
// sondern als Warnung gemeldet; eine Seite ohne erkennbare Struktur wirft `HblLayoutFehler`.
export interface HblParser {
  teams(html: string, k: { league: "hbl1" | "hbl2" }): HblTeam[];
  spielplan(html: string, k: { teams: HblTeamRef[] }): { spiele: HblSpiel[]; warnungen: string[] };
  tabelle(html: string, k: { teams: HblTeamRef[] }): { zeilen: HblTabellenzeile[]; warnungen: string[] };
  spiel(html: string, externalMatchId: string): HblLiveStand | null;
}

// Holt eine Seite der HBL (Pfad relativ zur Basis-URL) als Text. Injizierbar, damit alles ohne Netzwerk testbar ist.
export type HoleHbl = (pfad: string) => Promise<string>;
