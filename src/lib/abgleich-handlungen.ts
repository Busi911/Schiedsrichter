import type { VereinsAbgleich } from "@/lib/hallenplan-abgleich-laden";

// Was bei einem Verein noch Handlung braucht (abgeschlossene Schritte tauchen nicht auf). Eine Quelle für
// die Seite UND für Sicherheitsprüfungen (z.B. Hallenplan-Import abschalten).
export function handlungsbedarf(v: VereinsAbgleich): string[] {
  const t = v.trockenlauf;
  const l: string[] = [];
  if (t.verknuepfbarOffen > 0) l.push(`${t.verknuepfbarOffen} sicher zugeordnete Termine sind noch nicht mit dem öffentlichen Spiel verknüpft.`);
  if (t.doppelteKuenftig > 0) l.push(`${t.doppelteKuenftig} künftige Termine sind doppelt vorhanden (mehrere Termine für dasselbe Spiel) und werden deshalb nicht automatisch verknüpft (Liste unten). Bitte melden: Import-Termine lassen sich im Kalender nicht löschen.`);
  if (!v.uebernahmeAktiv) l.push("Die automatische Übernahme (fehlende Heimspiele, Verlegungen, Ergebnisse, Ansetzung) ist ausgeschaltet.");
  // nur künftige Termine: Spiele der Vorsaison werden nie zuordenbar (stehen weiter in den Details)
  if (t.pflichtOffenKuenftig > 0) l.push(`${t.pflichtOffenKuenftig} künftige Liga-Pflichtspiel-Termine sind nicht sicher zugeordnet — Liste unten.`);
  if (t.ortAbweichungenKuenftig > 0) l.push(`${t.ortAbweichungenKuenftig} künftige Termine mit anderem Hallennamen als öffentlich — prüfen, ob nur ein anderer Name oder eine echte Verlegung (Liste unten).`);
  return l;
}
