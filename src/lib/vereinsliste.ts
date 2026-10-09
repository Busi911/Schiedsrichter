// Sortierung der öffentlichen Vereinsliste: nach dem Ortsnamen, nicht nach der Rechtsform davor
// ("HSG Dutenhofen", "TSF Heuchelheim", "TSG Leihgestern" -> Dutenhofen, Heuchelheim, Leihgestern).
// Ein Präfix ist ein kurzes Kürzel mit mindestens zwei Großbuchstaben (HSG, TSV, TuS, VfL, JSG ...); "Rhein" o.ä. bleibt stehen.
const PRAEFIX = /^([A-Za-zÄÖÜäöü.]{2,5})\s+/;
const istKuerzel = (wort: string) => (wort.match(/[A-ZÄÖÜ]/g) ?? []).length >= 2;

export function sortierName(name: string): string {
  let rest = name.trim();
  for (let i = 0; i < 2; i++) {
    const m = PRAEFIX.exec(rest);
    if (!m || !istKuerzel(m[1])) break;
    const kuerzer = rest.slice(m[0].length);
    if (kuerzer === "") break;
    rest = kuerzer;
  }
  return rest;
}

export function sortiereVereine<T extends { name: string }>(vereine: T[]): T[] {
  return [...vereine].sort(
    (a, b) => sortierName(a.name).localeCompare(sortierName(b.name), "de", { sensitivity: "base" }) || a.name.localeCompare(b.name, "de"),
  );
}
