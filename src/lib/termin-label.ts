// Für termin.typ = "rundenspiel" reicht ein statisches Label ("Rundenspiel")
// nicht — die Beschreibung kennzeichnet dieselbe Zeile bereits als
// Ligaspiel, Freundschaftsspiel oder Turnier (siehe rundenspiel-import.ts),
// ein zusätzliches, widersprüchliches "Rundenspiel"-Badge daneben verwirrt
// nur. Zentrale Stelle, damit alle Kalender-/Listen-Ansichten dieselbe
// Bezeichnung zeigen. freundschaftsTyp ist nur bei pflichtspiel = false
// gesetzt UND wenn sich eindeutig entscheiden ließ, um welche der beiden
// Arten es sich handelt — sonst (null) bleibt es beim unspezifischen
// Fallback "Freundschaftsspiel/Turnier".
export function rundenspielTypLabel(
  pflichtspiel: boolean | null | undefined,
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null
): string {
  if (pflichtspiel) return "Ligaspiel";
  if (freundschaftsTyp === "freundschaftsspiel") return "Freundschaftsspiel";
  if (freundschaftsTyp === "turnier") return "Turnier";
  return "Freundschaftsspiel/Turnier";
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
