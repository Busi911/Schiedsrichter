// Für termin.typ = "rundenspiel" reicht ein statisches Label ("Rundenspiel")
// nicht — die Beschreibung kennzeichnet dieselbe Zeile bereits als
// Ligaspiel oder Freundschaftsspiel/Turnier (siehe rundenspiel-import.ts),
// ein zusätzliches, widersprüchliches "Rundenspiel"-Badge daneben verwirrt
// nur. Zentrale Stelle, damit alle Kalender-/Listen-Ansichten dieselbe
// Bezeichnung zeigen.
export function rundenspielTypLabel(pflichtspiel: boolean | null | undefined): string {
  return pflichtspiel ? "Ligaspiel" : "Freundschaftsspiel/Turnier";
}

// "24:20"-Format, nur wenn BEIDE Werte erfasst sind (siehe ergebnisHeim/
// ergebnisAuswaerts in db/schema.ts) — ein einzelner erfasster Wert reicht
// nicht als Endstand.
export function formatErgebnis(
  heim: number | null | undefined,
  auswaerts: number | null | undefined
): string | null {
  return heim != null && auswaerts != null ? `${heim}:${auswaerts}` : null;
}
