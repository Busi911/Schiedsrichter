// Reine Favoriten-Logik ohne Browser-/React-Abhängigkeit — auch serverseitig
// nutzbar (Route api/fan/favoriten-cookie); liga-favoriten-lokal.ts ist ein
// Client-Modul und darf nicht aus Server-Code importiert werden.
export type Favoriten = { vereine: string[]; mannschaften: string[] };

export const MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LEER: Favoriten = Object.freeze({ vereine: [], mannschaften: [] }) as Favoriten;

function bereinige(liste: unknown): string[] {
  if (!Array.isArray(liste)) return [];
  return [...new Set(liste.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, MAX);
}

// Rein (testbar): robustes Lesen, auch bei kaputtem/manipuliertem Inhalt.
export function parseFavoriten(raw: string | null): Favoriten {
  if (!raw) return LEER;
  try {
    const daten = JSON.parse(raw) as Partial<Favoriten>;
    return { vereine: bereinige(daten.vereine), mannschaften: bereinige(daten.mannschaften) };
  } catch {
    return LEER;
  }
}

