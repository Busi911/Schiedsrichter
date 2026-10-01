import { normalisiereMannschaft } from "./normalisierung";

// Filter für Zusatzquellen (siehe liga_verein_zusatzquelle): aus einem
// Partnerverein werden nur Mannschaften übernommen, die zu den gewählten
// Kategorien passen und – falls gesetzt – einen Textteil im Mannschafts- oder
// Liganamen tragen. Rein, damit ohne Datenbank/Netz testbar.

export type ZusatzFilter = { kategorien: string; nameEnthaelt: string | null };

export function parseKategorien(roh: string | null | undefined): string[] {
  return (roh ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function passtZumZusatzFilter(
  team: { mannschaftsname: string; ligaName: string },
  filter: ZusatzFilter
): boolean {
  const norm = normalisiereMannschaft(team.mannschaftsname, team.ligaName);
  if (norm.entfaellt) return false;
  const kategorien = parseKategorien(filter.kategorien);
  if (kategorien.length > 0 && !kategorien.includes(norm.kategorie)) return false;
  const teil = filter.nameEnthaelt?.trim().toLowerCase();
  if (teil && !`${team.mannschaftsname} ${team.ligaName}`.toLowerCase().includes(teil)) return false;
  return true;
}

// Diagnosetext, wenn der Filter nichts trifft: was liefert die Vereinsliste
// des Partnervereins überhaupt (Saison, Kategorien, Beispielnamen) und an
// welcher Stufe fällt alles heraus? Nur öffentliche Mannschafts-/Liganamen.
export function beschreibeZusatzVerein(
  teams: { mannschaftsname: string; ligaName: string; saison: string | null; regulaer: boolean }[],
  saison: string,
  filter: ZusatzFilter
): string {
  if (teams.length === 0) return "Vereinsliste leer oder nicht lesbar";
  const saisonTeams = teams.filter((t) => t.regulaer && t.saison === saison);
  if (saisonTeams.length === 0) {
    const saisons = [...new Set(teams.map((t) => t.saison ?? "?"))].join(", ");
    return `${teams.length} Einträge, aber keine reguläre Mannschaft in Saison ${saison} (vorhanden: ${saisons})`;
  }
  const kategorien = parseKategorien(filter.kategorien);
  const proKategorie = new Map<string, number>();
  for (const t of saisonTeams) {
    const k = normalisiereMannschaft(t.mannschaftsname, t.ligaName).kategorie;
    proKategorie.set(k, (proKategorie.get(k) ?? 0) + 1);
  }
  const nachKategorie = saisonTeams.filter((t) =>
    passtZumZusatzFilter(t, { kategorien: filter.kategorien, nameEnthaelt: null })
  );
  const beispiele = saisonTeams
    .slice(0, 5)
    .map((t) => `${t.mannschaftsname} / ${t.ligaName}`)
    .join("; ");
  return (
    `${saisonTeams.length} Mannschaften in Saison ${saison} (` +
    [...proKategorie].map(([k, n]) => `${k}: ${n}`).join(", ") +
    `); ${kategorien.length ? `${nachKategorie.length} passen zur Kategorie` : "keine Kategorie gewählt"}` +
    (filter.nameEnthaelt ? `, davon ${nachKategorie.filter((t) => passtZumZusatzFilter(t, filter)).length} zum Namensteil „${filter.nameEnthaelt}“` : "") +
    `. Beispiele: ${beispiele}`
  );
}
