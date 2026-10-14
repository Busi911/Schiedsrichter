// Feste IDs des öffentlichen Demo-Vereins (siehe lib/demo-verein.ts) — eigene Datei ohne Importe, damit auch auth.ts/proxy sie ohne Datenbank-Code laden können.
export const DEMO_VEREIN_ID = "de300de3-0000-4000-8000-000000000001";
export const DEMO_ADMIN_ID = "demo-admin-user";
export const DEMO_TOKEN_ZEITNEHMER = "demo-eintragung-zeitnehmer";
export const DEMO_TOKEN_ORDNER = "demo-eintragung-ordner";
export const DEMO_TOKEN_DIENSTE = "demo-eintragung-dienste";
// Mindestabstand zwischen zwei Zurücksetzungen per Knopf (die Nacht-Zurücksetzung ignoriert ihn).
export const DEMO_RESET_PAUSE_MS = 10 * 60 * 1000;

// Darf der Demo-Verein per Knopf zurückgesetzt werden? erstelltAm ist der Zeitpunkt der letzten Zurücksetzung (der Verein wird dabei neu angelegt).
// Eigene Funktion, damit Komponenten nicht Date.now() im Render aufrufen.
export function darfDemoZuruecksetzen(erstelltAm: Date): boolean {
  return Date.now() - erstelltAm.getTime() >= DEMO_RESET_PAUSE_MS;
}
