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
export function bedarfFuer(
  verein: VereinBedarf,
  typ: string,
  rolle: "ordner" | "kioskdienst"
): number {
  if (typ === "testspiel") {
    return rolle === "ordner"
      ? verein.testspielOrdnerBedarf
      : verein.testspielKioskdienstBedarf;
  }
  if (typ === "turnier") {
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
