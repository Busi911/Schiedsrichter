import { istZwischenstand } from "./liga-spiel-status";
import type { MannschaftsBilanz } from "./dienste-statistik-typen";
import type { SpielAnsicht } from "./liga-spiele-hilfen";

// Bilanz (Sieg/Unentschieden/Niederlage) je Mannschaft aus ALLEN Spielen der öffentlichen Liga-Daten, also Heim- UND
// Auswärtsspiele sowie Freundschaftsspiele — anders als die frühere Statistik, die nur Heimspiele aus dem
// Hallenplan-Import kannte. Rein (ohne DB), damit ohne Testdatenbank testbar.
// Nicht gezählt: Spiele ohne Ergebnis, Zwischenstände laufender Spiele (nicht genehmigt, Anwurf < 3 h her) und
// Nichtantritte (kein spielerisches Ergebnis).
export type StatistikMannschaft = {
  id: string;
  name: string;
  altersklasse: string | null;
  teamtableId: string | null;
  spiele: SpielAnsicht[];
};

export function berechneBilanzAusLigaSpielen(
  mannschaften: StatistikMannschaft[],
  jetzt: Date
): MannschaftsBilanz[] {
  const bilanzen: MannschaftsBilanz[] = [];
  for (const m of mannschaften) {
    if (!m.teamtableId) continue;
    const bilanz: MannschaftsBilanz = {
      mannschaftId: m.id,
      label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
      siege: 0,
      unentschieden: 0,
      niederlagen: 0,
      spiele: 0,
    };
    for (const s of m.spiele) {
      if (s.toreHeim === null || s.toreGast === null) continue;
      if (s.status === "nicht_angetreten" || istZwischenstand(s, jetzt)) continue;
      const heim = s.heimTeamtableId === m.teamtableId;
      if (!heim && s.gastTeamtableId !== m.teamtableId) continue;
      const eigen = heim ? s.toreHeim : s.toreGast;
      const gegner = heim ? s.toreGast : s.toreHeim;
      bilanz.spiele++;
      if (eigen > gegner) bilanz.siege++;
      else if (eigen < gegner) bilanz.niederlagen++;
      else bilanz.unentschieden++;
    }
    if (bilanz.spiele > 0) bilanzen.push(bilanz);
  }
  // Wie bisher: nach (Siege − Niederlagen), bei Gleichstand nach Anzahl Spiele.
  return bilanzen.sort(
    (a, b) => b.siege - b.niederlagen - (a.siege - a.niederlagen) || b.spiele - a.spiele
  );
}
