// Welche Arten von Einträgen der Kalender zeigt (reine Hilfen, getestet in kalender-arten.test.ts). Im Link steht nur, was ausgeblendet ist bzw. die Auswahl:
// `?zeige=spiele,training` — ohne Angabe sind alle Arten sichtbar.
export const KALENDER_ARTEN = {
  spiele: "Spiele & Dienste",
  training: "Training",
  verein: "Vereinstermine",
} as const;
export type KalenderArt = keyof typeof KALENDER_ARTEN;
export const istKalenderArt = (x: string): x is KalenderArt => Object.hasOwn(KALENDER_ARTEN, x);
const ALLE = Object.keys(KALENDER_ARTEN) as KalenderArt[];

// Auswahl aus dem Suchparameter; unbekannte Werte fallen weg, eine leere/ungültige Auswahl heißt "alle".
export function parseKalenderArten(param: string | undefined): Set<KalenderArt> {
  const gewaehlt = (param ?? "").split(",").map((s) => s.trim()).filter(istKalenderArt);
  return new Set(gewaehlt.length > 0 ? gewaehlt : ALLE);
}

// Zusatz für Links (z.B. Monatswechsel): leer, wenn alles gezeigt wird.
export function kalenderArtenZusatz(arten: Set<KalenderArt>): string {
  if (ALLE.every((a) => arten.has(a))) return "";
  return `&zeige=${ALLE.filter((a) => arten.has(a)).join(",")}`;
}

// Auswahl nach einem Klick auf einen Filter: die Art ein-/ausschalten, aber nie alles ausschalten.
export function schalteKalenderArt(arten: Set<KalenderArt>, art: KalenderArt): Set<KalenderArt> {
  const neu = new Set(arten);
  if (neu.has(art)) neu.delete(art);
  else neu.add(art);
  return neu.size === 0 ? new Set(arten) : neu;
}
