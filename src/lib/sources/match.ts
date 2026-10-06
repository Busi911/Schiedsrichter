// Gemeinsames Spiel-Modell aller Datenquellen (nuLiga, handball.net, ndr.de für 1./2. HBL). Jede Quelle hat ihren eigenen Parser/Adapter
// und wird hier normalisiert (`normalisierung.ts`); die Anzeige muss nie wissen, woher ein Spiel kommt.

export type MatchSource = "nuliga" | "handball-net" | "ndr";

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

// Interne Wettbewerbs-Kennungen der Männer-Bundesligen (Quelle ndr.de).
export type BundesLiga = "hbl1" | "hbl2";

export const BUNDESLIGEN: Record<BundesLiga, { name: string; kurz: string; pfad: string; spieltage: number }> = {
  hbl1: { name: "1. Handball-Bundesliga", kurz: "1. HBL", pfad: "deutschland-hbl", spieltage: 34 },
  hbl2: { name: "2. Handball-Bundesliga", kurz: "2. HBL", pfad: "deutschland-2-hbl", spieltage: 34 },
};
