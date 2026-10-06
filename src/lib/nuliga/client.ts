import "server-only";
import { contentTypeKannBildSein, erkenneBildtyp } from "@/lib/bildtyp";
import { istErlaubteNuligaBildUrl } from "./verbaende";

// HTTP-Zugriff auf nuLiga mit Rücksicht auf die Server des Verbands:
// strikt sequenziell (ein Prozess-weiter Mindestabstand zwischen zwei
// Requests), Timeout, ein einziger Wiederholungsversuch bei 429/5xx.
// Der Abruf ist als Funktion injizierbar (HoleHtml), damit der Sync ohne
// Netzwerk getestet werden kann.
export type HoleHtml = (url: string) => Promise<string>;
export type HoleBild = (url: string) => Promise<{ daten: Buffer; contentType: string; mime?: string }>;

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
// nur freigegebene Hosts (SSRF), Weiterleitungen nur auf ebenfalls freigegebene URLs (höchstens 2), Content-Type nur
// als Hinweis, die Magic Bytes entscheiden (nie die URL-Endung), harte Größengrenze beim Lesen.
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
      // Content-Type nur als Hinweis (nuLiga liefert evtl. application/octet-stream): entscheidend sind die Magic Bytes.
      if (!contentTypeKannBildSein(contentType)) throw new Error(`Kein Bild (Content-Type ${contentType})`);
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
      const daten = Buffer.concat(teile);
      const typ = erkenneBildtyp(daten);
      if (!typ) throw new Error(`Kein erlaubtes Bildformat (Content-Type ${contentType || "unbekannt"}, Magic Bytes passen zu keinem PNG/JPEG/GIF/WebP)`);
      return { daten, contentType, mime: typ.mime };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Zu viele Weiterleitungen");
};

// Nur für die Diagnose (Systemadmin): EIN Abruf ohne Wirkung, meldet Status, Content-Type, Größe und erkannten
// Bildtyp statt bei Problemen zu werfen. Gleiche Host-Prüfung wie der echte Download.
export type BildDiagnose = {
  url: string;
  erlaubt: boolean;
  status: number | null;
  location: string | null;
  contentType: string | null;
  bytes: number | null;
  erkannterTyp: string | null;
  fehler: string | null;
};

export async function diagnoseNuligaBild(url: string): Promise<BildDiagnose> {
  const d: BildDiagnose = { url, erlaubt: istErlaubteNuligaBildUrl(url), status: null, location: null, contentType: null, bytes: null, erkannterTyp: null, fehler: null };
  if (!d.erlaubt) {
    d.fehler = "URL nicht erlaubt (Host/Pfad)";
    return d;
  }
  const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
  if (wartezeit > 0) await warte(wartezeit);
  letzterRequest = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*;q=0.8" } });
    d.status = response.status;
    d.location = response.headers.get("location");
    d.contentType = response.headers.get("content-type");
    const daten = Buffer.from(await response.arrayBuffer());
    d.bytes = daten.length;
    d.erkannterTyp = erkenneBildtyp(daten)?.mime ?? null;
  } catch (err) {
    d.fehler = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeout);
  }
  return d;
}
