import "server-only";
import { beschreibeFormat, beschreibeNichtBild, contentTypeKannBildSein, erkenneBildtyp, maskierePersonendaten } from "@/lib/bildtyp";
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
      if (!typ) throw new Error(beschreibeNichtBild(daten, contentType));
      return { daten, contentType, mime: typ.mime };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Zu viele Weiterleitungen");
};

// ---------------------------------------------------------------------------------------------------------
// Diagnose (nur Systemadmin, /system/nuliga-diagnose): Abrufe ohne Wirkung, die NIE werfen, sondern alles
// melden, was zum Eingrenzen nötig ist (Status, Weiterleitungskette, Cookies, Content-Type, Bytes). Gleiche
// Host-Prüfung und gleiches Tempolimit wie der echte Abruf; Sicherheitsprüfungen bleiben an.
// ---------------------------------------------------------------------------------------------------------
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BROWSER_ACCEPT = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

async function gedrosselt(): Promise<void> {
  const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
  if (wartezeit > 0) await warte(wartezeit);
  letzterRequest = Date.now();
}

export type SeitenDiagnose = {
  url: string;
  status: number | null;
  finalUrl: string | null;
  weitergeleitet: boolean;
  contentType: string | null;
  cookieNamen: string[];
  // Nur für den Folgeabruf (Cookie-Header), wird nie angezeigt.
  cookieHeader: string;
  html: string;
  titel: string | null;
  fehler: string | null;
};

export async function diagnoseNuligaSeite(url: string): Promise<SeitenDiagnose> {
  const d: SeitenDiagnose = { url, status: null, finalUrl: null, weitergeleitet: false, contentType: null, cookieNamen: [], cookieHeader: "", html: "", titel: null, fehler: null };
  await gedrosselt();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "de-DE,de;q=0.9" } });
    d.status = response.status;
    d.finalUrl = response.url;
    d.weitergeleitet = response.redirected;
    d.contentType = response.headers.get("content-type");
    const cookies = response.headers.getSetCookie?.() ?? [];
    d.cookieNamen = cookies.map((c) => c.split("=")[0].trim());
    d.cookieHeader = cookies.map((c) => c.split(";")[0].trim()).join("; ");
    d.html = await response.text();
    d.titel = d.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  } catch (err) {
    d.fehler = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeout);
  }
  return d;
}

export type BildDiagnose = {
  variante: string;
  startUrl: string;
  kette: { url: string; status: number; location: string | null }[];
  finalUrl: string | null;
  finalerHost: string | null;
  status: number | null;
  contentType: string | null;
  contentLength: string | null;
  bytes: number | null;
  hex32: string | null;
  // Nur wenn es KEIN erkanntes Bild ist: die ersten Zeichen als Text (E-Mail-Adressen/Telefonnummern maskiert).
  textVorschau: string | null;
  htmlTitel: string | null;
  format: string | null;
  fehler: string | null;
};

export type BildOptionen = { cookie?: string; referer?: string; browserHeader?: boolean };

// EIN Logo-Abruf, Weiterleitungen von Hand (höchstens 5, jede Station wird wie beim echten Download geprüft).
export async function diagnoseNuligaBild(startUrl: string, variante: string, opt: BildOptionen = {}): Promise<BildDiagnose> {
  const d: BildDiagnose = { variante, startUrl, kette: [], finalUrl: null, finalerHost: null, status: null, contentType: null, contentLength: null, bytes: null, hex32: null, textVorschau: null, htmlTitel: null, format: null, fehler: null };
  let url = startUrl;
  try {
    for (let sprung = 0; sprung < 5; sprung++) {
      if (!istErlaubteNuligaBildUrl(url)) {
        d.fehler = `URL nicht erlaubt (Host/Pfad): ${url}`;
        return d;
      }
      await gedrosselt();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const headers: Record<string, string> = { "User-Agent": opt.browserHeader ? BROWSER_UA : USER_AGENT, Accept: opt.browserHeader ? BROWSER_ACCEPT : "image/*,*/*;q=0.8" };
        if (opt.cookie) headers.Cookie = opt.cookie;
        if (opt.referer) headers.Referer = opt.referer;
        const response = await fetch(url, { signal: controller.signal, redirect: "manual", headers });
        const location = response.headers.get("location");
        d.kette.push({ url, status: response.status, location });
        d.status = response.status;
        d.finalUrl = url;
        d.finalerHost = new URL(url).hostname;
        if (response.status >= 300 && response.status < 400 && location) {
          url = new URL(location, url).toString();
          await response.arrayBuffer().catch(() => undefined);
          continue;
        }
        d.contentType = response.headers.get("content-type");
        d.contentLength = response.headers.get("content-length");
        const daten = Buffer.from(await response.arrayBuffer());
        d.bytes = daten.length;
        d.hex32 = [...daten.subarray(0, 32)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
        d.format = beschreibeFormat(daten);
        if (!erkenneBildtyp(daten)) {
          const text = daten.subarray(0, 200).toString("utf8");
          d.textVorschau = maskierePersonendaten(text.replace(/\s+/g, " "));
          d.htmlTitel = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? daten.toString("utf8", 0, 4000).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
        }
        return d;
      } finally {
        clearTimeout(timeout);
      }
    }
    d.fehler = "Zu viele Weiterleitungen";
  } catch (err) {
    d.fehler = err instanceof Error ? err.message : String(err);
  }
  return d;
}

export { BROWSER_UA };
