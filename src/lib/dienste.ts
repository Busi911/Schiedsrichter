import "server-only";
import type { vereine } from "@/db/schema";

type VereinBedarf = Pick<
  typeof vereine.$inferSelect,
  | "testspielOrdnerBedarf"
  | "testspielKioskdienstBedarf"
  | "turnierOrdnerBedarf"
  | "turnierKioskdienstBedarf"
  | "rundenspielOrdnerBedarf"
  | "rundenspielKioskdienstBedarf"
>;

// Dienste-Bedarf gilt bewusst nur für testspiel/turnier/rundenspiel (eigene
// Veranstaltungen bzw. Heimspiele an der eigenen Halle) — nicht für
// spiel_ics (persönliche Einsätze des Schiedsrichters, oft bei fremden
// Vereinen).
//
// Bei Rundenspielen mit pflichtspiel = false (Freundschaftsspiel/Turnier
// innerhalb des Liga-Spielplans, siehe rundenspiel-import.ts) ist der
// rundenspielOrdnerBedarf/-KioskdienstBedarf NICHT zutreffend — das ist der
// Bedarf für echte Ligaspiele. Stattdessen gilt der Bedarf der Veranstaltung,
// die es laut freundschaftsTyp tatsächlich ist (testspiel- bzw.
// turnier-Bedarf), bzw. testspielBedarf als Fallback, wenn freundschaftsTyp
// (noch) nicht eindeutig ableitbar war.
export function bedarfFuer(
  verein: VereinBedarf,
  typ: string,
  rolle: "ordner" | "kioskdienst",
  pflichtspiel?: boolean | null,
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null
): number {
  if (typ === "testspiel" || (typ === "rundenspiel" && pflichtspiel === false && freundschaftsTyp !== "turnier")) {
    return rolle === "ordner"
      ? verein.testspielOrdnerBedarf
      : verein.testspielKioskdienstBedarf;
  }
  if (typ === "turnier" || (typ === "rundenspiel" && pflichtspiel === false && freundschaftsTyp === "turnier")) {
    return rolle === "ordner"
      ? verein.turnierOrdnerBedarf
      : verein.turnierKioskdienstBedarf;
  }
  if (typ === "rundenspiel") {
    return rolle === "ordner"
      ? verein.rundenspielOrdnerBedarf
      : verein.rundenspielKioskdienstBedarf;
  }
  return 0;
}
