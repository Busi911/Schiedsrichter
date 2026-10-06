// Gemeinsames Spiel-Modell aller Datenquellen (nuLiga, handball.net, sport.de für 1./2. HBL). Jede Quelle hat ihren eigenen Parser/Adapter
// und wird hier normalisiert (`normalisierung.ts`); die Anzeige muss nie wissen, woher ein Spiel kommt.

export type MatchSource = "nuliga" | "handball-net" | "sportde";

export type MatchStatus = "scheduled" | "live" | "halftime" | "finished" | "interrupted" | "postponed" | "cancelled";

export type MatchTeam = {
  externalId?: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
};

export interface Match {
  id: string;
  source: MatchSource;
  externalMatchId: string;
  competitionId?: string;
  competitionName: string;
  season: string;
  matchday?: number;
  startTime: Date;
  status: MatchStatus;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore?: number;
  awayScore?: number;
  halftimeHomeScore?: number;
  halftimeAwayScore?: number;
  venue?: string;
  sourceUrl?: string;
}

// Interne Wettbewerbs-Kennungen der Quelle sport.de (1. und 2. Handball-Bundesliga).
export type SportDeLiga = "hbl1" | "hbl2";

export const SPORTDE_LIGEN: Record<SportDeLiga, { name: string; kurz: string; pfad: string; spieltage: number }> = {
  hbl1: { name: "1. Handball-Bundesliga", kurz: "1. HBL", pfad: "deutschland-hbl", spieltage: 34 },
  hbl2: { name: "2. Handball-Bundesliga", kurz: "2. HBL", pfad: "deutschland-2-hbl", spieltage: 34 },
};
