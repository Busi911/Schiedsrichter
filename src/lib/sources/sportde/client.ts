import "server-only";
import { SPORTDE_BASIS } from "./urls";
import type { HoleSeite } from "./types";

// HTTP-Zugriff auf die ÖFFENTLICHEN HTML-Seiten von sport.de (kein Login, kein API-Key, keine Cookies, keine private Schnittstelle).
// Rücksicht: strikt sequenziell mit Mindestabstand, Timeout, ein Wiederholungsversuch bei 429/5xx, ehrlicher User-Agent, nur Pfade unter
// /handball/. Das Abrufen erfolgt nur für fällige Seiten (siehe sync.ts), nicht für jeden gespeicherten Datensatz.

const MIN_ABSTAND_MS = Number(process.env.SPORTDE_MIN_ABSTAND_MS ?? 1000);
const TIMEOUT_MS = 20_000;
const MAX_ZEICHEN = 3_000_000;

let letzterRequest = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const holeSportDeSeite: HoleSeite = async (pfad) => {
  if (!/^\/handball\/[A-Za-z0-9\-_/]+$/.test(pfad)) throw new Error("sport.de-Pfad muss mit /handball/ beginnen");
  for (let versuch = 0; versuch < 2; versuch++) {
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${SPORTDE_BASIS}${pfad}`, {
        signal: controller.signal,
        headers: {
          "User-Agent": process.env.SPORTDE_USER_AGENT ?? "Handballerpate/1.0 (Vereinsseiten; öffentliche Spieldaten)",
          Accept: "text/html",
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
      if (text.length > MAX_ZEICHEN) throw new Error("Antwort zu groß");
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("sport.de nicht erreichbar");
};

// Nur für die Diagnose: die Antwort OHNE Fehlerbehandlung (Status, ausgewählte Header, Anfang des Textes) — z.B. um eine Zugriffssperre (403) zu
// verstehen. Ruft nur /robots.txt oder /handball/… auf, mit demselben ehrlichen User-Agent wie der Sync (keine Tarnung als Browser).
export async function pruefeSportDeZugriff(pfad: string): Promise<{ status: number; header: Record<string, string>; text: string }> {
  if (pfad !== "/robots.txt" && !/^\/handball\/[A-Za-z0-9\-_/]+$/.test(pfad)) throw new Error("Pfad nicht erlaubt");
  const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
  if (wartezeit > 0) await warte(wartezeit);
  letzterRequest = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${SPORTDE_BASIS}${pfad}`, {
      signal: controller.signal,
      headers: { "User-Agent": process.env.SPORTDE_USER_AGENT ?? "Handballerpate/1.0 (Vereinsseiten; öffentliche Spieldaten)", Accept: "text/html,text/plain" },
      cache: "no-store",
    });
    const header: Record<string, string> = {};
    for (const name of ["server", "content-type", "retry-after", "via", "x-cache", "cf-mitigated", "cf-ray", "x-akamai-error", "x-datadome", "x-sucuri-id", "x-robots-tag", "location"]) {
      const v = response.headers.get(name);
      if (v) header[name] = v.slice(0, 200);
    }
    return { status: response.status, header, text: (await response.text()).slice(0, 4000) };
  } finally {
    clearTimeout(timeout);
  }
}
