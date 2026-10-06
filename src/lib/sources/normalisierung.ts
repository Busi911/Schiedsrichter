import type { ligaGruppen, ligaSpiele } from "@/db/schema";
import { berlinOffset } from "@/lib/format";
import type { Match, MatchStatus } from "./match";
import type { SportDeSpiel } from "./sportde/types";
import { vollUrl } from "./sportde/urls";

// Normalisierung der drei Quellen auf EIN Spiel-Modell (`Match`). nuLiga/handball.net werden aus den bereits
// gespeicherten liga_*-Zeilen normalisiert (deren Parser bleiben unverändert), sport.de (1./2. HBL) aus der Zwischenform des Adapters.

type SpielZeile = typeof ligaSpiele.$inferSelect;
type GruppeZeile = Pick<typeof ligaGruppen.$inferSelect, "nuligaGroupId" | "ligaName" | "saison">;

function statusAusZeile(s: SpielZeile): MatchStatus {
  switch (s.status) {
    case "gespielt":
    case "nicht_angetreten":
      return "finished";
    case "verlegt":
      return "postponed";
    case "abgesagt":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function startZeit(s: SpielZeile): Date {
  if (s.beginn) return s.beginn;
  const uhr = s.uhrzeit ?? "00:00";
  return new Date(`${s.datum}T${uhr}:00${berlinOffset(s.datum)}`);
}

function ausZeile(s: SpielZeile, g: GruppeZeile, source: "nuliga" | "handball-net"): Match {
  const extern = source === "nuliga" ? (s.meetingId ?? `${s.gruppeId}:${s.spielnummer ?? ""}`) : (s.externeId ?? s.spielcode ?? s.id);
  return {
    id: s.id,
    source,
    externalMatchId: extern,
    competitionId: g.nuligaGroupId,
    competitionName: g.ligaName,
    season: g.saison ?? "",
    startTime: startZeit(s),
    status: statusAusZeile(s),
    homeTeam: { externalId: s.heimTeamtableId ?? undefined, name: s.heimName },
    awayTeam: { externalId: s.gastTeamtableId ?? undefined, name: s.gastName },
    homeScore: s.toreHeim ?? undefined,
    awayScore: s.toreGast ?? undefined,
    halftimeHomeScore: s.halbzeitHeim ?? undefined,
    halftimeAwayScore: s.halbzeitGast ?? undefined,
    venue: s.halleName ?? undefined,
  };
}

export const normalizeNuligaMatch = (s: SpielZeile, g: GruppeZeile): Match => ausZeile(s, g, "nuliga");
export const normalizeHandballNetMatch = (s: SpielZeile, g: GruppeZeile): Match => ausZeile(s, g, "handball-net");

export function normalizeSportDeMatch(
  s: SportDeSpiel,
  k: { competitionId: string; competitionName: string; season: string; logos?: Map<string, string> }
): Match {
  const datum = s.datum ?? "1970-01-01";
  return {
    id: `sportde:${s.externalMatchId}`,
    source: "sportde",
    externalMatchId: s.externalMatchId,
    competitionId: k.competitionId,
    competitionName: k.competitionName,
    season: k.season,
    matchday: s.spieltag ?? undefined,
    // Ohne Uhrzeit (z.B. beendete Spiele auf der Spieltagsseite): 12:00 des Spieltags als Platzhalter für die Sortierung.
    startTime: s.startTime ?? new Date(`${datum}T12:00:00${berlinOffset(datum)}`),
    status: s.status ?? "scheduled",
    homeTeam: { externalId: s.home.externalId, name: s.home.name, logoUrl: s.home.logoUrl ?? k.logos?.get(s.home.externalId) },
    awayTeam: { externalId: s.away.externalId, name: s.away.name, logoUrl: s.away.logoUrl ?? k.logos?.get(s.away.externalId) },
    homeScore: s.homeScore ?? undefined,
    awayScore: s.awayScore ?? undefined,
    halftimeHomeScore: s.halftimeHomeScore ?? undefined,
    halftimeAwayScore: s.halftimeAwayScore ?? undefined,
    venue: s.venue ?? undefined,
    sourceUrl: s.sourceUrl ?? (s.matchPfad ? vollUrl(s.matchPfad) : undefined),
  };
}
