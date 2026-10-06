import "server-only";
import { HBL_BASIS, HblNichtKonfiguriert } from "./parser";
import type { HblEndpunkte, HoleHbl } from "./types";

// HTTP-Zugriff auf die ÖFFENTLICHE HBL-Seite (opel-hbl.de). Rücksicht wie bei nuLiga/handball.net: strikt sequenziell
// mit Mindestabstand, Timeout, ein Wiederholungsversuch bei 429/5xx, ehrlicher User-Agent. Kein Zugriff auf die private
// Sportradar-Plattform. Die Adressen kommen aus `HblEndpunkte` (Konfiguration), nicht aus dem Code.

const MIN_ABSTAND_MS = Number(process.env.HBL_MIN_ABSTAND_MS ?? 1000);
const TIMEOUT_MS = 20_000;

let letzterRequest = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const holeHblApi: HoleHbl = async (pfad) => {
  if (!pfad.startsWith("/")) throw new Error("HBL-Pfad muss relativ zur Basis-URL sein");
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
          Accept: "application/json, text/html;q=0.8",
        },
      });
      if ((response.status === 429 || response.status >= 500) && versuch === 0) {
        await warte(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const typ = response.headers.get("content-type") ?? "";
      return typ.includes("json") ? await response.json() : await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("HBL nicht erreichbar");
};

// Die Endpunkt-Konfiguration ist erst mit verifizierten URLs vorhanden.
let konfiguration: HblEndpunkte | null = null;
export function setzeHblEndpunkte(e: HblEndpunkte | null) {
  konfiguration = e;
}
export function holeHblEndpunkte(): HblEndpunkte {
  if (!konfiguration) throw new HblNichtKonfiguriert("Endpunkte (Request-URLs)");
  return konfiguration;
}
