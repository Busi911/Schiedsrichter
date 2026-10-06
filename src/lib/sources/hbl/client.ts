import "server-only";
import { HBL_BASIS } from "./parser";
import type { HoleHbl } from "./types";

// HTTP-Zugriff auf die ÖFFENTLICHEN HTML-Seiten der HBL (opel-hbl.de, kein Login, keine Cookies). Rücksicht: strikt
// sequenziell mit Mindestabstand, Timeout, ein Wiederholungsversuch bei 429/5xx, ehrlicher User-Agent. Kein Zugriff auf die
// private Sportradar-/DataCore-API. Die Spielseite wird für den Live-Stand höchstens alle 10 Sekunden je Spiel geholt (siehe live-cache.ts).

const MIN_ABSTAND_MS = Number(process.env.HBL_MIN_ABSTAND_MS ?? 1000);
const TIMEOUT_MS = 20_000;

let letzterRequest = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function holeText(pfad: string, accept: string, maxBytes: number): Promise<string> {
  for (let versuch = 0; versuch < 2; versuch++) {
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${HBL_BASIS}${pfad}`, {
        signal: controller.signal,
        headers: {
          "User-Agent": process.env.HBL_USER_AGENT ?? "Handballerpate/1.0 (Vereinsseiten; öffentliche Spieldaten)",
          Accept: accept,
          "Accept-Language": "de-DE,de;q=0.9",
        },
        cache: "no-store",
      });
      if ((response.status === 429 || response.status >= 500) && versuch === 0) {
        await warte(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > maxBytes) throw new Error("Antwort zu groß");
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("HBL nicht erreichbar");
}

export const holeHblSeite: HoleHbl = async (pfad) => {
  if (!pfad.startsWith("/de/")) throw new Error("HBL-Pfad muss mit /de/ beginnen");
  return holeText(pfad, "text/html", 3_000_000);
};

// Nur für die Diagnose: öffentliche Skript-Dateien der Seite (…/_nuxt/….js), um zu sehen, woher die Seite ihre Daten lädt.
export async function holeHblSkriptDatei(pfad: string): Promise<string> {
  if (!/^\/_nuxt\/[A-Za-z0-9_.\-\/]+\.js$/.test(pfad)) throw new Error("Nur /_nuxt/…js erlaubt");
  return holeText(pfad, "application/javascript, */*;q=0.5", 6_000_000);
}
