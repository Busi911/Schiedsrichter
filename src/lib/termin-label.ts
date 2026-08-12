// Für termin.typ = "rundenspiel" reicht ein statisches Label ("Rundenspiel")
// nicht — die Beschreibung kennzeichnet dieselbe Zeile bereits als
// Ligaspiel oder Freundschaftsspiel/Turnier (siehe rundenspiel-import.ts),
// ein zusätzliches, widersprüchliches "Rundenspiel"-Badge daneben verwirrt
// nur. Zentrale Stelle, damit alle Kalender-/Listen-Ansichten dieselbe
// Bezeichnung zeigen.
export function rundenspielTypLabel(pflichtspiel: boolean | null | undefined): string {
  return pflichtspiel ? "Ligaspiel" : "Freundschaftsspiel/Turnier";
}
