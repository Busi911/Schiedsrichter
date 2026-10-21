import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { synchronisiereFaellige } from "@/lib/nuliga/sync-cron";

// 280 s statt der früheren 60 s (Vercel Pro erlaubt bis 300 s) — siehe
// liga-sync/route.ts für die Begründung (gewachsene Vereinszahl, 24h-SLA
// der sync-ueberwachung.ts).
export const maxDuration = 280;

// Spätestens nach dieser Zeit antwortet die Route selbst (Vercel bricht nach maxDuration hart ab); der Rest folgt beim nächsten Aufruf.
const WATCHDOG_MS = 268_000;

// Eigener Cron für handball.net (DHB: 3. Liga, Jugendbundesliga, Quali), getrennt vom nuLiga-Sync (/api/cron/liga-sync): dort
// verbrauchte nuLiga das Zeitbudget, und Vereine mit gestern gespielten DHB-Spielen kamen stundenlang nicht dran. Läuft nur für
// Vereine MIT handball.net-Quelle; die Reihenfolge (Spiel heute, dann gespielt ohne Ergebnis, dann gestern/morgen, dann reihum)
// steht in sync-cron.ts.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const start = Date.now();
  let schritt = "Start";
  const melde = (text: string) => {
    schritt = `+${Math.round((Date.now() - start) / 1000)} s ${text}`;
  };

  const lauf = synchronisiereFaellige({
    db: adminDb,
    holeHtml: async () => {
      throw new Error("handball-net-sync ruft kein nuLiga ab");
    },
    holeJson: async (pfad) => {
      melde(`handball.net-Abruf ${pfad.replace(/^https?:\/\/[^/]+/, "").slice(0, 120)}`);
      return holeHandballNetApi(pfad);
    },
    quelle: "handball_net",
    budgetMs: 255_000,
    beiSchritt: melde,
  });
  lauf.catch((err) => console.error("[handball-net-sync] Fehler nach dem Watchdog:", err));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<"haengt">((resolve) => {
    timer = setTimeout(() => resolve("haengt"), WATCHDOG_MS);
  });
  try {
    const lauferg = await Promise.race([lauf, watchdog]);
    if (lauferg === "haengt") {
      console.error(`[handball-net-sync] Watchdog nach ${WATCHDOG_MS / 1000} s – letzter Schritt: ${schritt}`);
      return Response.json({ abgebrochen: true, letzterSchritt: schritt });
    }
    return Response.json({ synchronisiert: lauferg.ergebnisse.length, vollstaendig: lauferg.vollstaendig, ergebnisse: lauferg.ergebnisse });
  } catch (err) {
    console.error(`[handball-net-sync] Fehler (Schritt: ${schritt}):`, err);
    return Response.json({ fehler: err instanceof Error ? err.message : String(err), letzterSchritt: schritt }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
