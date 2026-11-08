// Gemeinsame Zeitprüfung für Termine und Trainingszeiten: ein Ende muss NACH dem
// Beginn liegen. Ungültige Eingaben werden zurückgewiesen, nie still korrigiert.

export const FEHLER_ENDE_VOR_BEGINN = "Das Ende muss nach dem Beginn liegen.";

/** Fehlertext, wenn das Ende nicht nach dem Beginn liegt; sonst null. Kein Ende (null) ist erlaubt. */
export function pruefeEndeNachBeginn(beginn: Date, ende: Date | null): string | null {
  if (!ende) return null;
  return ende.getTime() > beginn.getTime() ? null : FEHLER_ENDE_VOR_BEGINN;
}

/** Wie `pruefeEndeNachBeginn`, für Minuten seit Mitternacht (Trainingszeiten). */
export function pruefeEndeMinutenNachBeginn(startMinuten: number, endMinuten: number): string | null {
  return endMinuten > startMinuten ? null : FEHLER_ENDE_VOR_BEGINN;
}
