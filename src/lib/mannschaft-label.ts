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
  return t.kategorie ? lesbareKategorie(t.kategorie) : null;
}

// nuLiga-Kürzel ("M", "F", "MJE", "WJD") lesbar machen. Alles, was nicht
// genau so aussieht, bleibt unverändert.
export function lesbareKategorie(roh: string): string {
  const k = roh.trim();
  if (k === "M") return "Männer";
  if (k === "F") return "Frauen";
  const jugend = /^([MW])J([A-E])$/i.exec(k);
  if (jugend) {
    const art = jugend[1].toUpperCase() === "M" ? "männliche" : "weibliche";
    return `${art} ${jugend[2].toUpperCase()}-Jugend`;
  }
  return roh;
}
