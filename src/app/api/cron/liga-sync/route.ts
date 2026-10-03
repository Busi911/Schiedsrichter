import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { synchronisiereFaellige } from "@/lib/nuliga/sync-cron";

// Serverless-Laufzeit großzügig: nuLiga wird bewusst langsam (1 Request je
// ~1,5 s) abgefragt, siehe lib/nuliga/client.ts.
export const maxDuration = 60;

// Spätestens nach dieser Zeit antwortet die Route selbst, bevor Vercel den Lauf nach 60 s hart
// abbricht (504, ohne jede Spur im Log). Der Rest folgt beim nächsten Aufruf.
const WATCHDOG_MS = 52_000;

// Entscheidet je Verein selbst, was fällig ist (Struktur ~täglich, Spiele
// spieltagsnah ~45 Min, sonst ~6 Std., siehe sync-cron.ts) — der Cron kann
// daher beliebig oft laufen, ein zu früher Aufruf macht schlicht nichts.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  // Letzter bekannter Schritt mit Uhrzeit: zeigt im Log, WO ein Lauf hängt (nuLiga, handball.net, DB).
  const start = Date.now();
  let schritt = "Start";
  const melde = (text: string) => {
    schritt = `+${Math.round((Date.now() - start) / 1000)} s ${text}`;
  };
  const kurz = (url: string) => url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120);

  const lauf = synchronisiereFaellige({
    db: adminDb,
    holeHtml: async (url) => {
      melde(`nuLiga-Abruf ${kurz(url)}`);
      try {
        return await holeNuligaHtml(url);
      } finally {
        melde("nuLiga-Abruf fertig");
      }
    },
    holeJson: async (pfad) => {
      melde(`handball.net-Abruf ${kurz(pfad)}`);
      try {
        return await holeHandballNetApi(pfad);
      } finally {
        melde("handball.net-Abruf fertig");
      }
    },
    budgetMs: 40_000,
    beiSchritt: melde,
  });
  // Ein Fehler nach dem Watchdog soll nicht als unbehandelte Ablehnung enden.
  lauf.catch((err) => console.error("[liga-sync] Fehler nach dem Watchdog:", err));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<"haengt">((resolve) => {
    timer = setTimeout(() => resolve("haengt"), WATCHDOG_MS);
  });
  try {
    const ergebnisse = await Promise.race([lauf, watchdog]);
    if (ergebnisse === "haengt") {
      console.error(`[liga-sync] Watchdog nach ${WATCHDOG_MS / 1000} s – letzter Schritt: ${schritt}`);
      return Response.json({ abgebrochen: true, letzterSchritt: schritt });
    }
    return Response.json({ synchronisiert: ergebnisse.length, ergebnisse });
  } finally {
    clearTimeout(timer);
  }
}
