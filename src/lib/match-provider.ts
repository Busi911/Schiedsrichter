import type { SpielAnsicht } from "./liga-spiele-hilfen";
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

// handball.net: Die API liefert kein report-Feld mit URL. Spielbericht-Seiten unter
// /spiele/{code} sind eine Angular-SPA ohne serverseitig gelieferte, stabile URLs —
// alle /spiele/-Varianten (mit code, ID, /spielbericht, /info) liefern HTTP 404.
// Bekannte Limitierung: kein Spielbericht-Link für handball.net-Spiele.
export const handballNetQuelle: SpielQuelle = { berichtUrl: () => null, liveUrl: () => null };

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
  liveUrl: () => null,
};

export function quelleFuer(spiel: SpielAnsicht): SpielQuelle {
  if (spiel.quelle === "ndr") return ndrQuelle;
  return spiel.quelle === "handball_net" ? handballNetQuelle : nuLigaQuelle;
}
