import type { HblWettbewerb } from "../match";

// Typen der HBL-Quelle (https://www.opel-hbl.de, Daten von Sportradar). Das ist die ZWISCHENFORM, die der Parser aus
// den öffentlichen Antworten der HBL-Seite erzeugt — und zugleich eine WHITELIST: was hier kein Feld hat, wird nie
// gelesen und nie gespeichert (die Antworten können Personendaten enthalten: Schiedsrichter, Spieler, Offizielle).
// Verwendet wird NUR die öffentliche Seite, nie die private Sportradar-Plattform/DataCore-API.

// Sportradar-Spielzustände (Handball).
export type SportradarStatus =
  | "NOT_STARTED"
  | "FIRST_HALF"
  | "HALFTIME"
  | "SECOND_HALF"
  | "ENDED"
  | "AWAITING_OT"
  | "FIRST_HALF_OT"
  | "OT_HALFTIME"
  | "SECOND_HALF_OT"
  | "AFTER_OT"
  | "AWAITING_PENALTIES"
  | "PENALTY_SHOOTING"
  | "AFTER_PENALTIES"
  | "INTERRUPTED"
  | "ABANDONED";

export type HblTeam = {
  externalId: string; // Team-UUID aus /de/team/<Code>/<UUID>
  code: string | null; // z.B. "THW"
  name: string;
  shortName: string | null;
  logoUrl: string | null; // nur von der öffentlichen HBL-Seite (Host images.dc.connect.sportradar.com)
};

export type HblSpiel = {
  externalMatchId: string; // Spiel-UUID aus /de/match/<UUID> — primärer externer Schlüssel
  startTime: Date;
  status: SportradarStatus | null; // null = unbekannter Wert (wird als geplant behandelt und gemeldet)
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

// Zustand eines Spiels live (für den späteren Liveticker). Die Ereignisliste (Tore, Zeitstrafen, Paraden …) kommt später.
export type HblLiveStand = {
  externalMatchId: string;
  status: SportradarStatus | null;
  homeScore: number | null;
  awayScore: number | null;
  spielzeit: string | null;
};

export type HblAbfrage = { wettbewerb: HblWettbewerb; saison: string };

// Die HTTP-Adressen sind bewusst NICHT im Code geraten: sie werden von außen geliefert (Konfiguration), sobald die
// Request-URLs der HBL-Seite verifiziert sind. Jede Funktion baut den Pfad (relativ zu https://www.opel-hbl.de).
export type HblEndpunkte = {
  teams(a: HblAbfrage): string;
  spielplan(a: HblAbfrage): string;
  tabelle(a: HblAbfrage): string;
  live(externalMatchId: string): string;
};

// Aus der Antwort (JSON oder HTML-Text, je nach Endpunkt) erzeugt der Parser die Zwischenformen. Die echte Umsetzung
// kommt mit den Beispielantworten; bis dahin gibt es nur den Vertrag und Tests mit einem Testparser.
export interface HblParser {
  teams(roh: unknown): HblTeam[];
  spielplan(roh: unknown): HblSpiel[];
  tabelle(roh: unknown): HblTabellenzeile[] | null;
  live(roh: unknown): HblLiveStand | null;
}

// Holt eine Antwort der HBL-Seite (Pfad relativ zur Basis-URL). Injizierbar, damit alles ohne Netzwerk testbar ist.
export type HoleHbl = (pfad: string) => Promise<unknown>;
