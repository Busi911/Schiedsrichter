// Welche Mannschaften eines Vereins im handball.net-Sync zuerst dran sind: Spiel HEUTE oder ein Spiel der letzten Tage OHNE
// Ergebnis (gespielt, aber noch nicht eingetragen). Ein Verein mit vielen Mannschaften schafft nicht alle in einem Lauf (500 ms
// Abstand je Abruf, 40 s Budget); ohne diese Reihenfolge kamen die Mannschaften mit offenem Ergebnis erst nach den übrigen dran.
export type TeamSpielStand = {
  heimTeamId: string | null;
  gastTeamId: string | null;
  datum: string; // "YYYY-MM-DD"
  status: string;
  toreHeim: number | null;
};

export function dringendeTeamIds(spiele: TeamSpielStand[], heute: string): Set<string> {
  const ids = new Set<string>();
  for (const s of spiele) {
    const heuteGespielt = s.datum === heute;
    const offen = s.datum < heute && (s.status === "geplant" || s.status === "gespielt") && s.toreHeim === null;
    if (!heuteGespielt && !offen) continue;
    if (s.heimTeamId) ids.add(s.heimTeamId);
    if (s.gastTeamId) ids.add(s.gastTeamId);
  }
  return ids;
}
