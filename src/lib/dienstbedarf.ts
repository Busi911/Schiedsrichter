// Hat der Verein überhaupt Dienstbedarf eingerichtet? (rein/getestet). Ohne jeden Bedarf (alle Dienste „nirgends gebraucht“) darf die Oberfläche nicht
// „Alles besetzt“ sagen, das suggeriert Einteilungen; stattdessen kommt der Hinweis „Dienstbedarf einrichten“ (Testbericht 09.11.2026).

export const VEREIN_BEDARF_FELDER = [
  "testspielOrdnerBedarf",
  "testspielKioskdienstBedarf",
  "turnierOrdnerBedarf",
  "turnierKioskdienstBedarf",
  "rundenspielOrdnerBedarf",
  "rundenspielKioskdienstBedarf",
  "testspielKassiererBedarf",
  "turnierKassiererBedarf",
  "rundenspielKassiererBedarf",
  "testspielZeitnehmerBedarf",
  "turnierZeitnehmerBedarf",
  "rundenspielZeitnehmerBedarf",
] as const;

export type VereinBedarfWerte = Record<(typeof VEREIN_BEDARF_FELDER)[number], number>;

export type EigenerDienstBedarf = {
  aktiv: boolean;
  bedarfHeim: number;
  bedarfAuswaerts: number;
  bedarfFreundschaft: number;
  bedarfTurnier: number;
};

export function hatDienstbedarf(verein: VereinBedarfWerte | null | undefined, eigeneDienste: EigenerDienstBedarf[] = []): boolean {
  if (verein && VEREIN_BEDARF_FELDER.some((f) => (verein[f] ?? 0) > 0)) return true;
  return eigeneDienste.some((d) => d.aktiv && (d.bedarfHeim > 0 || d.bedarfAuswaerts > 0 || d.bedarfFreundschaft > 0 || d.bedarfTurnier > 0));
}
