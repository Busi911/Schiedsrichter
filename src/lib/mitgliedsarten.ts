// Arten der Mitgliedschaft (vom Verein gepflegt). Rein, ohne Datenbank.

/** Vorschläge, die der Verein mit einem Klick übernehmen kann. */
export const STANDARD_ARTEN = ["Aktives Mitglied", "Passives Mitglied", "Fördermitglied", "Ehrenmitglied", "Kind/Jugend"] as const;

export function pruefeArtName(roh: string): { name: string } | { fehler: string } {
  const name = roh.trim().replace(/\s+/g, " ");
  if (!name) return { fehler: "Bitte einen Namen eingeben." };
  if (name.length > 60) return { fehler: "Der Name ist zu lang (höchstens 60 Zeichen)." };
  return { name };
}

const schluessel = (n: string) => n.trim().toLowerCase();

/** Gibt es den Namen schon (Groß-/Kleinschreibung egal)? `ausser` = die Art, die gerade umbenannt wird. */
export function artNameVergeben(name: string, vorhandene: { id: string; name: string }[], ausser?: string): boolean {
  return vorhandene.some((a) => a.id !== ausser && schluessel(a.name) === schluessel(name));
}

/** Welche Vorschläge fehlen noch? */
export function fehlendeStandardArten(vorhandene: { name: string }[]): string[] {
  const da = new Set(vorhandene.map((a) => schluessel(a.name)));
  return STANDARD_ARTEN.filter((n) => !da.has(schluessel(n)));
}
