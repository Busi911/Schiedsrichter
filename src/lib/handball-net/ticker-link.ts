// Link zur Spielseite bei handball.net (dort liegt der Liveticker als Tab "LIVETICKER"). Belegt: Format
// https://www.handball.net/match/<handball.net-Spiel-ID>?season_id=<Saison> (im Browser geprüft, z.B. /match/392196?season_id=2627).
// Nicht belegt: ein Direktlink auf den Tab; deshalb führt der Link auf die Spielseite, die Seite selbst bietet den Tab an.
// Rein, ohne DB/Netz. Die Spiel-ID ist `liga_spiel.externe_id` (aus der Spielliste der handball.net-API, siehe sync.ts).
const BASIS = "https://www.handball.net";

// Saison-Parameter aus der offiziellen Spielnummer: sie beginnt mit der Saison als zwei zweistelligen Jahren
// ("2627DHBJBLAJMB0504" -> "2627"). Passt das Muster nicht (kein aufeinanderfolgendes Jahrespaar), bleibt der Parameter weg.
export function saisonAusSpielcode(spielcode: string | null): string | null {
  const m = spielcode?.match(/^(\d{2})(\d{2})/);
  if (!m) return null;
  const von = Number(m[1]);
  const bis = Number(m[2]);
  return bis === (von + 1) % 100 ? `${m[1]}${m[2]}` : null;
}

export function handballNetSpielUrl(externeId: string | null, spielcode: string | null): string | null {
  if (!externeId || !/^\d+$/.test(externeId)) return null;
  const saison = saisonAusSpielcode(spielcode);
  return `${BASIS}/match/${externeId}${saison ? `?season_id=${saison}` : ""}`;
}
