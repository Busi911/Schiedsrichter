import "server-only";

// HTTP-Zugriff auf nuLiga mit Rücksicht auf die Server des Verbands:
// strikt sequenziell (ein Prozess-weiter Mindestabstand zwischen zwei
// Requests), Timeout, ein einziger Wiederholungsversuch bei 429/5xx.
// Der Abruf ist als Funktion injizierbar (HoleHtml), damit der Sync ohne
// Netzwerk getestet werden kann.
export type HoleHtml = (url: string) => Promise<string>;

const MIN_ABSTAND_MS = Number(process.env.NULIGA_MIN_ABSTAND_MS ?? 1000);
const TIMEOUT_MS = 20_000;

// Ehrlicher User-Agent mit Kontakt statt Browser-Tarnung (der HHV hat dem
// Abruf zugestimmt). Falls nuLiga bei unbekanntem Agent andere/leere Seiten
// liefert, erkennt der Parser das (Warnung "Keine Mannschaften gefunden")
// und über NULIGA_USER_AGENT lässt sich ein anderer Wert setzen.
const USER_AGENT =
  process.env.NULIGA_USER_AGENT ??
  "Handballerpate/1.0 (Vereinsseiten; Abruf mit Zustimmung des HHV)";

let letzterRequest = 0;

function warte(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const holeNuligaHtml: HoleHtml = async (url) => {
  for (let versuch = 0; versuch < 2; versuch++) {
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de-DE,de;q=0.9",
        },
      });
      if ((response.status === 429 || response.status >= 500) && versuch === 0) {
        await warte(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("nuLiga nicht erreichbar");
};
