import "server-only";
import type { HoleSeite } from "../spieltag/types";
import { NDR_BASIS } from "./urls";

// HTTP-Zugriff auf die ÖFFENTLICHEN Ergebnisseiten von ndr.de (kein Login, keine Cookies, keine private Schnittstelle, keine Browser-Tarnung).
// Rücksicht: sequenziell mit Mindestabstand, Timeout, ein Wiederholungsversuch bei 429/5xx, ehrlicher User-Agent, nur Pfade unter /sport/ergebnisse/.
// Gleiche Seiten werden innerhalb eines Laufs nur einmal geholt (die 2. HBL steht auf EINER Seite für alle Spieltage).

const MIN_ABSTAND_MS = Number(process.env.NDR_MIN_ABSTAND_MS ?? 1000);
const TIMEOUT_MS = 20_000;
const MAX_ZEICHEN = 3_000_000;

let letzterRequest = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const holeNdrSeite: HoleSeite = async (pfad) => {
  if (!/^\/sport\/ergebnisse\/[A-Za-z0-9\-_~.%]+$/.test(pfad)) throw new Error("ndr.de-Pfad muss mit /sport/ergebnisse/ beginnen");
  for (let versuch = 0; versuch < 2; versuch++) {
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${NDR_BASIS}${pfad}`, {
        signal: controller.signal,
        headers: { "User-Agent": process.env.NDR_USER_AGENT ?? "Handballerpate/1.0 (Vereinsseiten; öffentliche Spieldaten)", Accept: "text/html", "Accept-Language": "de-DE,de;q=0.9" },
        cache: "no-store",
      });
      if ((response.status === 429 || response.status >= 500) && versuch === 0) {
        await warte(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > MAX_ZEICHEN) throw new Error("Antwort zu groß");
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("ndr.de nicht erreichbar");
};

// Innerhalb eines Laufs jede Seite nur einmal holen.
export function mitLaufCache(hole: HoleSeite): HoleSeite {
  const cache = new Map<string, Promise<string>>();
  return (pfad) => {
    let p = cache.get(pfad);
    if (!p) {
      p = hole(pfad);
      cache.set(pfad, p);
      p.catch(() => cache.delete(pfad));
    }
    return p;
  };
}
