import "server-only";

export type HoleJson = (pfad: string) => Promise<unknown>;
const BASIS = "https://www.handball.net";
const USER_AGENT = "HandballerPate/1.0 (+https://handballerpate.de/)";

/** Keine Bodies, Cookies oder Tokens in Fehlern: Antworten enthalten Personendaten. */
export class HandballNetHttpFehler extends Error {
  constructor(public status: number, public pfad: string, public requestId: string | null, public challenge: boolean) {
    super(`HTTP ${status}${challenge ? " (Zugriffsprüfung)" : ""}${requestId ? `; Request-ID ${requestId}` : ""}`);
    this.name = "HandballNetHttpFehler";
  }
}

/** Reguläre Website-Sitzung mit Client-Token und Cookies, keine Browser-Tarnung.
 * Warteschlange und Sitzungsdaten gelten pro Instanz, nicht als verteiltes Limit.
 */
export function erstelleHandballNetClient(opt: {
  fetch?: typeof fetch;
  minAbstandMs?: number;
  warte?: (ms: number) => Promise<void>;
  jetzt?: () => number;
} = {}): HoleJson {
  const laden = opt.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const warten = opt.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const jetzt = opt.jetzt ?? Date.now;
  const konfiguriert = Number(process.env.HANDBALL_NET_MIN_ABSTAND_MS ?? 500);
  const abstand = opt.minAbstandMs ?? (Number.isFinite(konfiguriert) ? Math.max(500, konfiguriert) : 500);
  const cookies = new Map<string, { wert: string; bis: number }>();
  let token: string | null = null;
  let tokenBis = 0;
  let letzterRequest = -Infinity;
  let schlange = Promise.resolve();

  async function request(pfad: string, html = false): Promise<Response> {
    const pause = letzterRequest + abstand - jetzt();
    if (pause > 0) await warten(pause);
    letzterRequest = jetzt();
    const cookie = [...cookies].filter(([, c]) => c.bis > jetzt()).map(([k, c]) => k + "=" + c.wert).join("; ");
    const headers: Record<string, string> = {
      "User-Agent": process.env.HANDBALL_NET_USER_AGENT || USER_AGENT,
      Accept: html ? "text/html" : "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(html ? { "Cache-Control": "no-cache" } : { Origin: BASIS, Referer: BASIS + "/", "x-client-token": token! }),
    };
    const response = await laden(BASIS + pfad, {
      headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const pos = pair.indexOf("=");
      if (pos < 1) continue;
      const maxAge = attributes.find((a) => /^\s*max-age=/i.test(a));
      const expires = attributes.find((a) => /^\s*expires=/i.test(a));
      const bis = maxAge ? jetzt() + Number(maxAge.split("=")[1]) * 1000 : expires ? Date.parse(expires.slice(expires.indexOf("=") + 1)) : Infinity;
      cookies.set(pair.slice(0, pos).trim(), { wert: pair.slice(pos + 1), bis });
    }
    return response;
  }

  function httpFehler(r: Response, pfad: string) {
    return new HandballNetHttpFehler(r.status, pfad.split("?")[0], r.headers.get("cf-ray") ?? r.headers.get("x-request-id"), r.headers.get("cf-mitigated") === "challenge");
  }

  async function sitzung() {
    token = null;
    const r = await request("/", true);
    if (!r.ok) { await r.body?.cancel(); throw httpFehler(r, "/"); }
    const html = await r.text();
    const meta = html.match(/<meta\b[^>]*\bname\s*=\s*["']client-token["'][^>]*>/i)?.[0];
    token = meta?.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    if (!token) throw new Error("handball.net: Startseite ohne Client-Token (Zugangsverfahren geändert)");
    // Konservativ kurz, keine Annahme über die undokumentierte Laufzeit.
    tokenBis = jetzt() + 60_000;
  }

  async function hole(pfad: string): Promise<unknown> {
    if (!/^\/api\/new\/[A-Za-z0-9_\-./?=&,%:+]*$/.test(pfad) || pfad.includes("..") || pfad.includes("//")) {
      throw new Error("handball.net: ungültiger API-Pfad");
    }
    if (!token || tokenBis <= jetzt()) await sitzung();
    let wiederholt = false;
    let erneuert = false;
    for (;;) {
      const r = await request(pfad);
      if ((r.status === 429 || r.status >= 500) && !wiederholt) {
        wiederholt = true;
        const retry = r.headers.get("retry-after");
        const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - jetzt()) : 5_000;
        // Lange Sperrfristen niemals durch einen früheren Retry unterschreiten.
        if (Number.isFinite(delay) && delay <= 20_000) {
          await r.body?.cancel();
          await warten(Math.max(0, delay));
          if (tokenBis <= jetzt()) await sitzung();
          continue;
        }
      }
      const istJson = /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(r.headers.get("content-type") ?? "");
      const body: unknown = istJson ? await r.json().catch(() => null) : null;
      if (!istJson) await r.body?.cancel();
      const code = body && typeof body === "object" && "code" in body ? body.code : null;
      if (r.status === 403 && code === "CLIENT_TOKEN_EXPIRED" && !erneuert) {
        erneuert = true;
        await sitzung();
        continue;
      }
      if (!r.ok) throw httpFehler(r, pfad);
      if (!istJson || body === null) throw new Error("handball.net: Antwort ohne gültiges JSON (Format geändert)");
      return body;
    }
  }

  return (pfad) => {
    const lauf = schlange.then(() => hole(pfad));
    schlange = lauf.then(() => undefined, () => undefined);
    return lauf;
  };
}

export const holeHandballNetApi = erstelleHandballNetClient();
