import type { SpielAnsicht } from "./liga-spiele-hilfen";
import { livetickerPfad, uebersichtPfad, vollUrl } from "./sources/sportde/urls";
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

// sport.de (1./2. HBL): `berichtUrl` an liga_spiel speichert das Verzeichnis der Spielseiten (ohne Domain); daraus werden Spielübersicht
// (Spielbericht) und Liveticker. Den Live-Stand liefert serverseitig `sources/sportde/live-cache.ts` über /api/liga/sportde-live/<ID>.
const SPORTDE_PFAD = /^\/handball\/[a-z0-9\-]+\/ma\d+\/(?:[a-z0-9_\-]+\/)?$/;
export const sportDeQuelle: SpielQuelle = {
  berichtUrl: (s) => (s.quelle === "sportde" && s.berichtUrl && SPORTDE_PFAD.test(s.berichtUrl) ? vollUrl(uebersichtPfad(s.berichtUrl)) : null),
  liveUrl: (s) => (s.quelle === "sportde" && s.berichtUrl && SPORTDE_PFAD.test(s.berichtUrl) ? vollUrl(livetickerPfad(s.berichtUrl)) : null),
};

// ndr.de (1./2. HBL, Phase 1: Spielplan, Ergebnisse, Tabelle): keine Spielseiten, kein Live — nur die Anzeige der gespeicherten Daten.
export const ndrQuelle: SpielQuelle = { berichtUrl: () => null, liveUrl: () => null };

export function quelleFuer(spiel: SpielAnsicht): SpielQuelle {
  if (spiel.quelle === "ndr") return ndrQuelle;
  if (spiel.quelle === "sportde") return sportDeQuelle;
  return spiel.quelle === "handball_net" ? handballNetQuelle : nuLigaQuelle;
}
