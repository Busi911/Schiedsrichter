// Adresse für den Teilen-Button: ein Pfad ("/verein/hsg/herren-1") wird mit dem Ursprung der Seite zur vollständigen Adresse,
// eine vollständige Adresse bleibt, wie sie ist. Nie mit Abfrage-Parametern oder Anker (kein Tracking, keine Vorschau-Steuerung wie ?sponsor=zeigen).
export function teilenAdresse(pfadOderUrl: string, ursprung: string): string {
  const u = new URL(pfadOderUrl, ursprung);
  u.search = "";
  u.hash = "";
  return u.toString();
}

/**
 * Pfad, den die Spielkarte teilt: die Seite der (ersten) eigenen Mannschaft, die das Spiel hat; ohne Treffer die Vereinsseite.
 * Es gibt keine eigene Seite je Spiel, die Mannschaftsseite zeigt es als nächstes Spiel bzw. in Spielplan/Ergebnissen.
 */
export function teilenPfadFuer(vereinSlug: string, mannschaften: { id: string; slug: string }[], mannschaftIds: string[]): string {
  const m = mannschaftIds.map((id) => mannschaften.find((x) => x.id === id)).find(Boolean);
  return m ? `/verein/${vereinSlug}/${m.slug}` : `/verein/${vereinSlug}`;
}
