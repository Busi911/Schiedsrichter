import type { SpielAnsicht } from "./liga-spiele-hilfen";
import { handballNetSpielUrl } from "./handball-net/ticker-link";
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
  berichtUrl: (s) => (s.quelle === "nuliga" ? baueBerichtUrl(s.verband ?? "HHV", s.berichtUrl) : null),
  liveUrl: (s) =>
    s.quelle === "nuliga" ? baueLiveSpielUrl(gruppenIdAusBerichtUrl(s.berichtUrl), s.meetingId) : null,
  // getLiveState: absichtlich nicht implementiert (kein verifizierter Endpunkt).
};

// handball.net: Die API liefert kein report-Feld mit URL; die früher probierten Pfade /spiele/{code} … lieferten 404 (siehe
// CLAUDE.md). Belegt ist die Spielseite /match/<Spiel-ID>?season_id=<Saison> mit dem Tab "LIVETICKER" (im Browser geprüft). Die Karte
// verlinkt deshalb im Live-Fenster (liveTickerRelevant) darauf, solange die Spiel-ID bekannt ist. Das ist nur ein Link: ob es Ticker-
// Ereignisse gibt, steht nicht in unseren Daten. Einen "Spielbericht"-Link gibt es weiterhin nicht (kein belegter Pfad).
export const handballNetQuelle: SpielQuelle = {
  berichtUrl: () => null,
  liveUrl: (s) => (s.quelle === "handball_net" ? handballNetSpielUrl(s.externeId, s.spielcode) : null),
};

// ndr.de (1./2. HBL, Phase 1): Spielbericht-Link aus der Spielstatistik-Seite.
// Der NDR-Parser extrahiert den 'spielstatistik-NNNN.html'-Link aus dem HTML und
// speichert ihn als berichtUrl (relativer Pfad). Hier wird die absolute URL gebaut.
export const ndrQuelle: SpielQuelle = {
  berichtUrl: (s) => {
    if (s.quelle !== "ndr" || !s.berichtUrl) return null;
    // Validiere: Pfad muss mit /sport/ergebnisse/spielstatistik- beginnen.
    if (!s.berichtUrl.startsWith("/sport/ergebnisse/spielstatistik-")) return null;
    return `https://www.ndr.de${s.berichtUrl}`;
  },
  // NDR verlinkt je Spiel EINEN Ticker/Bericht (spielstatistik-NNNN): während des Spiels ist es der Live-Ticker, danach der Spielbericht.
  // Welcher Link wann gezeigt wird, entscheidet die Karte (liveTickerRelevant bzw. Ergebnis vorhanden).
  liveUrl: (s) => ndrQuelle.berichtUrl(s),
};

export function quelleFuer(spiel: SpielAnsicht): SpielQuelle {
  if (spiel.quelle === "ndr") return ndrQuelle;
  return spiel.quelle === "handball_net" ? handballNetQuelle : nuLigaQuelle;
}
