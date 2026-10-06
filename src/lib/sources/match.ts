// Gemeinsames Spiel-Modell aller Datenquellen (nuLiga, handball.net, HBL). Jede Quelle hat ihren eigenen Parser/Adapter
// und wird hier normalisiert (`normalisierung.ts`); die Anzeige muss nie wissen, woher ein Spiel kommt.

export type MatchSource = "nuliga" | "handball-net" | "hbl";

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

// Interne Wettbewerbs-Kennungen der HBL-Quelle.
export type HblWettbewerb = "hbl1" | "hbl2" | "dhb-pokal" | "super-cup";

export const HBL_WETTBEWERBE: Record<HblWettbewerb, { name: string; kurz: string }> = {
  hbl1: { name: "Opel HBL (1. Handball-Bundesliga)", kurz: "1. HBL" },
  hbl2: { name: "2. Handball-Bundesliga", kurz: "2. HBL" },
  "dhb-pokal": { name: "DHB-Pokal", kurz: "DHB-Pokal" },
  "super-cup": { name: "Super Cup", kurz: "Super Cup" },
};
