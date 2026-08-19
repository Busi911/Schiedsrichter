// Sortiert Mannschaften nach Spielklasse statt alphabetisch nach Namen —
// alphabetisch würde z.B. "A-Jugend" vor "B-Jugend" aber auch vor "Herren 1"
// einsortieren, was in der Vereinspraxis nicht der erwarteten Reihenfolge
// entspricht (Männer, dann Frauen, dann Jugend A bis E, dann Mini/Maxi).
// Basiert bewusst auf dem freien `name`-Feld (kein eigenes Kategorie-Feld im
// Schema) — daher Muster-Erkennung statt eines festen Enums.
const KATEGORIE_MUSTER: { rang: number; muster: RegExp }[] = [
  { rang: 0, muster: /\b(herren|männer)\b/i },
  { rang: 1, muster: /\b(damen|frauen)\b/i },
  { rang: 2, muster: /\ba[-\s]?jugend\b/i },
  { rang: 3, muster: /\bb[-\s]?jugend\b/i },
  { rang: 4, muster: /\bc[-\s]?jugend\b/i },
  { rang: 5, muster: /\bd[-\s]?jugend\b/i },
  { rang: 6, muster: /\be[-\s]?jugend\b/i },
  { rang: 7, muster: /\bminis?\b/i },
  { rang: 8, muster: /\bmaxis?\b/i },
];

// Unbekannte/nicht erkannte Namen landen bewusst ganz hinten (nach Maxi)
// statt die Sortierung der erkannten Kategorien zu stören.
const UNBEKANNTER_RANG = KATEGORIE_MUSTER.length;

function kategorieRang(name: string): number {
  return KATEGORIE_MUSTER.find((k) => k.muster.test(name))?.rang ?? UNBEKANNTER_RANG;
}

// Erste Zahl im Namen (z.B. "Herren 2" -> 2) — Mannschaft 1 und 2 sollen
// innerhalb derselben Kategorie direkt untereinander stehen statt durch
// andere Kategorien getrennt zu werden.
function teamNummer(name: string): number {
  const match = name.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function vergleicheMannschaften<T extends { name: string }>(a: T, b: T): number {
  const rangDiff = kategorieRang(a.name) - kategorieRang(b.name);
  if (rangDiff !== 0) return rangDiff;
  const nummerDiff = teamNummer(a.name) - teamNummer(b.name);
  if (nummerDiff !== 0) return nummerDiff;
  return a.name.localeCompare(b.name, "de-DE");
}

export function sortiereMannschaften<T extends { name: string }>(liste: T[]): T[] {
  return [...liste].sort(vergleicheMannschaften);
}
