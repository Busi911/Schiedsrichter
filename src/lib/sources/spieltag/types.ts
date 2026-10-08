import type { MatchStatus, BundesLiga } from "../match";

// Zwischenform der Spieltagsseiten-Parser (derzeit ndr.de, 1./2. Handball-Bundesliga) und zugleich eine WHITELIST: nur Spiel-, Team- und
// Tabellendaten, keine Personen. Der Sync (`sync.ts`) schreibt daraus in die liga_*-Tabellen.

export type QuellTeam = {
  externalId: string; // Schlüssel des Teams: "name:<slug>" (NDR liefert keine Team-IDs)
  slug: string | null;
  name: string;
  shortName: string | null;
  logoUrl: string | null; // nur aus dem tatsächlichen img/src, nie konstruiert
  league: BundesLiga;
  sourceUrl: string | null;
};

export type QuellTeamRef = { externalId: string; name: string };

export type QuellSpiel = {
  externalMatchId: string; // Schlüssel des Spiels (bei ndr.de aus Liga, Saison, Spieltag und Paarung)
  matchPfad: string | null; // Pfad der Spielstatistik-Seite ohne Domain (z.B. /sport/ergebnisse/spielstatistik-4970.html)
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

export type QuellTabellenzeile = {
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

// Holt eine Seite (Pfad relativ zur Basis-URL) als Text; injizierbar, damit alles ohne Netzwerk testbar ist.
export type HoleSeite = (pfad: string) => Promise<string>;

export class QuellLayoutFehler extends Error {
  constructor(quelleOderWas: string, was: string) {
    super(`${quelleOderWas}: ${was} — Layout geändert oder Struktur unerwartet`);
  }
}
