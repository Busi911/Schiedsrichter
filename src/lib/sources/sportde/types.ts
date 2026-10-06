import type { MatchStatus, SportDeLiga } from "../match";

// Typen der Quelle sport.de (https://www.sport.de/handball/deutschland-hbl/ und …/deutschland-2-hbl/): öffentliches, serverseitig
// gerendertes HTML (kein Login, kein API-Key, keine private Schnittstelle). Das ist die ZWISCHENFORM der Parser und zugleich eine
// WHITELIST: nur Spiel-, Team- und Tabellendaten, keine Personen (Liveticker-Texte nennen Spieler; sie werden nie gespeichert).

export type SportDeTeam = {
  externalId: string; // sport.de-Team-Slug aus dem Team-Link, sonst "name:<slug>" (nie der Name allein als Schlüssel in der DB: er steckt im Präfix)
  slug: string | null;
  name: string;
  shortName: string | null;
  logoUrl: string | null; // nur aus dem tatsächlichen img/src, nie konstruiert
  league: SportDeLiga;
  sourceUrl: string | null;
};

export type SportDeTeamRef = { externalId: string; name: string };

export type SportDeSpiel = {
  externalMatchId: string; // "ma11406368" — stabiler Schlüssel, nie Datum + Namen
  matchPfad: string | null; // Verzeichnis der Spielseiten ohne Domain: /handball/deutschland-2-hbl/ma…/<teams>/
  spieltag: number | null;
  datum: string | null; // yyyy-mm-dd (deutsche Ortszeit)
  uhrzeit: string | null; // HH:MM
  startTime: Date | null;
  status: MatchStatus | null; // aus dem sichtbaren Statuswort; null = nicht erkannt oder künftig
  minute: number | null;
  home: { externalId: string; name: string; logoUrl: string | null };
  away: { externalId: string; name: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
  halftimeHomeScore: number | null;
  halftimeAwayScore: number | null;
  venue: string | null; // "Spielort"
  ort: string | null; // "Ort"
  sourceUrl: string | null;
};

export type SportDeTabellenzeile = {
  teamId: string;
  name: string;
  logoUrl: string | null;
  rang: number;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  torePlus: number;
  toreMinus: number;
  tordifferenz: number;
  punktePlus: number;
  punkteMinus: number;
  punkteRoh: string; // "11:3"
};

export type LiveEvent = {
  minute?: number;
  type:
    | "goal"
    | "seven_meter_goal"
    | "seven_meter_missed"
    | "two_minute"
    | "red_card"
    | "half_start"
    | "half_end"
    | "match_start"
    | "match_end"
    | "other";
  team?: string;
  player?: string; // wird nicht befüllt (keine Personendaten)
  homeScore?: number;
  awayScore?: number;
  text: string;
};

export type SportDeLiveStand = {
  externalMatchId: string;
  status: MatchStatus | null;
  statusText: string | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  halftimeHomeScore: number | null;
  halftimeAwayScore: number | null;
  events: LiveEvent[];
};

// Holt eine Seite (Pfad relativ zur Basis-URL) als Text; injizierbar, damit alles ohne Netzwerk testbar ist.
export type HoleSeite = (pfad: string) => Promise<string>;

export class SportDeLayoutFehler extends Error {
  constructor(quelleOderWas: string, was?: string) {
    super(was === undefined ? `sport.de: ${quelleOderWas} — Layout geändert oder Struktur unerwartet` : `${quelleOderWas}: ${was} — Layout geändert oder Struktur unerwartet`);
  }
}
