import "server-only";

// HTTP-Zugriff auf die JSON-API von handball.net (DHB). Der DHB hat dem
// automatischen Abruf zugestimmt. Rücksicht wie bei nuLiga: strikt
// sequenziell mit Mindestabstand, Timeout, ein Wiederholungsversuch bei
// 429/5xx. Die API verlangt Origin/Referer (sonst 403).
// Als Funktion injizierbar (HoleJson), damit der Sync ohne Netzwerk getestet
// werden kann.
export type HoleJson = (pfad: string) => Promise<unknown>;

const BASIS = "https://www.handball.net";
const MIN_ABSTAND_MS = Number(process.env.HANDBALL_NET_MIN_ABSTAND_MS ?? 500);
const TIMEOUT_MS = 20_000;

let letzterRequest = 0;
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const holeHandballNetApi: HoleJson = async (pfad) => {
  for (let versuch = 0; versuch < 2; versuch++) {
    const wartezeit = letzterRequest + MIN_ABSTAND_MS - Date.now();
    if (wartezeit > 0) await warte(wartezeit);
    letzterRequest = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASIS}${pfad}`, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            process.env.HANDBALL_NET_USER_AGENT ??
            "Mozilla/5.0 (compatible; Handballerpate/1.0; Vereinsseiten; Abruf mit Zustimmung des DHB)",
          Accept: "application/json",
          Origin: BASIS,
          Referer: `${BASIS}/`,
        },
      });
      if ((response.status === 429 || response.status >= 500) && versuch === 0) {
        await warte(5_000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("handball.net nicht erreichbar");
};
