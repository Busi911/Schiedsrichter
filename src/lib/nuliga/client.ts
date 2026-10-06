import "server-only";
import { istErlaubteNuligaBildUrl } from "./verbaende";

// HTTP-Zugriff auf nuLiga mit Rücksicht auf die Server des Verbands:
// strikt sequenziell (ein Prozess-weiter Mindestabstand zwischen zwei
// Requests), Timeout, ein einziger Wiederholungsversuch bei 429/5xx.
// Der Abruf ist als Funktion injizierbar (HoleHtml), damit der Sync ohne
// Netzwerk getestet werden kann.
export type HoleHtml = (url: string) => Promise<string>;
export type HoleBild = (url: string) => Promise<{ daten: Buffer; contentType: string }>;

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

const BILD_MAX_BYTES = 2 * 1024 * 1024;
const BILD_TYPEN = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

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

// Bild (Vereinslogo) von nuLiga holen — gleiche Rücksicht wie beim HTML (Mindestabstand, Timeout), dazu:
// nur freigegebene Hosts (SSRF), Weiterleitungen nur auf ebenfalls freigegebene URLs (höchstens 2), Content-Type
// MUSS ein Bildtyp sein (nie die URL-Endung), harte Größengrenze beim Lesen.
export const holeNuligaBild: HoleBild = async (startUrl) => {
  let url = startUrl;
  for (let sprung = 0; sprung < 3; sprung++) {
    if (!istErlaubteNuligaBildUrl(url)) throw new Error("Bild-URL nicht erlaubt");
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "image/*" },
      });
      if (response.status >= 300 && response.status < 400) {
        const ziel = response.headers.get("location");
        if (!ziel) throw new Error("Weiterleitung ohne Ziel");
        url = new URL(ziel, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!BILD_TYPEN.has(contentType)) throw new Error(`Kein erlaubter Bildtyp (${contentType || "unbekannt"})`);
      const laenge = Number(response.headers.get("content-length") ?? 0);
      if (laenge > BILD_MAX_BYTES) throw new Error("Bild zu groß");
      const teile: Uint8Array[] = [];
      let summe = 0;
      const leser = response.body?.getReader();
      if (!leser) throw new Error("Leere Antwort");
      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        summe += value.length;
        if (summe > BILD_MAX_BYTES) {
          await leser.cancel();
          throw new Error("Bild zu groß");
        }
        teile.push(value);
      }
      return { daten: Buffer.concat(teile), contentType };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Zu viele Weiterleitungen");
};
