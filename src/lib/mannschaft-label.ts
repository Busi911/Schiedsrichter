// Eigene, "server-only"-freie Datei (wie lib/lizenz-rollen.ts) — dashboard.ts
// selbst importiert transitiv mehrere "server-only"-Module (ordnerwart.ts,
// dienste.ts), daher bricht der Next.js-Build, sobald eine Client-
// Komponente (siehe testspiele-liste.tsx) auch nur eine einzelne reine
// Funktion von dort importiert. formatMannschaft hat keinerlei
// Server-Abhängigkeiten und lebt deshalb separat.

// Gemeinsame Anzeige-Logik für Mannschaft+Altersklasse, z.B. "Herren 1 (MJC)"
// — Fallback auf termine.kategorie (nuLiga-Rohwert), falls kein mannschaftId-
// Match möglich war (siehe findeMannschaft in rundenspiel-import.ts).
export function formatMannschaft(t: {
  mannschaftName?: string | null;
  mannschaftAltersklasse?: string | null;
  kategorie?: string | null;
}): string | null {
  if (t.mannschaftName) {
    return t.mannschaftAltersklasse
      ? `${t.mannschaftName} (${t.mannschaftAltersklasse})`
      : t.mannschaftName;
  }
  return t.kategorie ?? null;
}
