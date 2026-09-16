import { tagKey } from "./kalender";

// Handball-Saisons laufen nicht mit dem Kalenderjahr, sondern enden jeweils
// am 23. Juni. "Saison 2025/26" läuft also bis einschließlich 23.06.2026;
// ab dem 24.06.2026 zählt ein Termin bereits zur Saison 2026/27.
export function saisonLabel(d: Date): string {
  // Über tagKey (Europe/Berlin) statt d.getFullYear()/getMonth()/getDate()
  // (Laufzeitzone, auf Vercel UTC) — sonst würde ein Termin z.B. am
  // 24.06. um 00:30 Berliner Zeit auf einem UTC-Server noch als 23.06.
  // gelesen und fälschlich der alten Saison zugeordnet.
  const [jahrStr, monatStr, tagStr] = tagKey(d).split("-");
  const jahr = Number(jahrStr);
  const monatNull = Number(monatStr) - 1;
  const tag = Number(tagStr);
  const istNeueSaison = monatNull > 5 || (monatNull === 5 && tag >= 24);
  const saisonStartJahr = istNeueSaison ? jahr : jahr - 1;
  return `${saisonStartJahr}/${String((saisonStartJahr + 1) % 100).padStart(2, "0")}`;
}

// Sortierschlüssel (absteigend = aktuellste Saison zuerst).
export function saisonSortKey(label: string): number {
  return Number(label.slice(0, 4));
}

// Festschreibungsdatum: sobald eine Saison vorbei ist (23.06.), gilt sie als
// abgeschlossen. Termine aus abgeschlossenen Saisons werden vom ICS-Sync
// nicht mehr verändert oder gelöscht — nur die laufende Saison bleibt in
// Bewegung, die Vergangenheit bleibt als Verlauf fix stehen.
export function istSaisonAbgeschlossen(
  datum: Date,
  jetzt: Date = new Date()
): boolean {
  return saisonSortKey(saisonLabel(datum)) < saisonSortKey(saisonLabel(jetzt));
}
