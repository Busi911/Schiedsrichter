import "server-only";
import type { vereine } from "@/db/schema";

type VereinBedarf = Pick<
  typeof vereine.$inferSelect,
  | "testspielOrdnerBedarf"
  | "testspielKioskdienstBedarf"
  | "turnierOrdnerBedarf"
  | "turnierKioskdienstBedarf"
>;

// Dienste-Bedarf gilt bewusst nur für testspiel/turnier (eigene
// Veranstaltungen des Vereins) — nicht für spiel_ics (persönliche Einsätze
// des Schiedsrichters, oft bei fremden Vereinen).
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
  return 0;
}
