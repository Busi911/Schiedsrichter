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
