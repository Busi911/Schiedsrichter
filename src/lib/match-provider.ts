import type { SpielAnsicht } from "./liga-spiele-hilfen";
import { baueMatchUrl } from "./sources/hbl/parser";
import { baueBerichtUrl, baueLiveSpielUrl, gruppenIdAusBerichtUrl } from "./nuliga/verbaende";

// Schnittstelle für Spiel-Quellen (nuLiga, handball.net) — bewusst klein. Die Sync-Module
// (`nuliga/sync.ts`, `handball-net/sync.ts`) bleiben unverändert; hier hängt nur die ANZEIGE an
// quellenspezifischen Links. `getLiveState` ist vorbereitet, aber für nuLiga noch NICHT umgesetzt: der Daten-
// Endpunkt von nuScoreLive ist nicht verifiziert (siehe CLAUDE.md) und wird nicht erraten.
export type LiveSpielstand = {
  status: "scheduled" | "live" | "halftime" | "finished";
  heimTore: number;
  gastTore: number;
  spielzeit?: string;
  aktualisiertAm: Date;
};

export interface SpielQuelle {
  berichtUrl(spiel: SpielAnsicht): string | null;
  liveUrl(spiel: SpielAnsicht): string | null;
  getLiveState?(spiel: SpielAnsicht): Promise<LiveSpielstand | null>;
}

export const nuLigaQuelle: SpielQuelle = {
  berichtUrl: (s) => (s.quelle === "nuliga" ? baueBerichtUrl("HHV", s.berichtUrl) : null),
  liveUrl: (s) =>
    s.quelle === "nuliga" ? baueLiveSpielUrl(gruppenIdAusBerichtUrl(s.berichtUrl), s.meetingId) : null,
  // getLiveState: absichtlich nicht implementiert (kein verifizierter Endpunkt).
};

// handball.net: noch kein Link/Live-Zugriff vorgesehen.
export const handballNetQuelle: SpielQuelle = { berichtUrl: () => null, liveUrl: () => null };

// HBL: die öffentliche Spielseite der HBL zeigt Spielbericht und Live-Stand (UUID = externe Spiel-ID). `getLiveState` wird
// serverseitig über `sources/hbl/live.ts` angebunden, sobald die verifizierten Endpunkte vorliegen.
export const hblQuelle: SpielQuelle = {
  berichtUrl: (s) => (s.quelle === "hbl" && s.externeId ? baueMatchUrl(s.externeId) : null),
  liveUrl: (s) => (s.quelle === "hbl" && s.externeId ? baueMatchUrl(s.externeId) : null),
};

export function quelleFuer(spiel: SpielAnsicht): SpielQuelle {
  if (spiel.quelle === "hbl") return hblQuelle;
  return spiel.quelle === "handball_net" ? handballNetQuelle : nuLigaQuelle;
}
