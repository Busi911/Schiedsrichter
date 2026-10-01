import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { synchronisiereFaellige } from "@/lib/nuliga/sync-cron";

// Serverless-Laufzeit großzügig: nuLiga wird bewusst langsam (1 Request je
// ~1,5 s) abgefragt, siehe lib/nuliga/client.ts.
export const maxDuration = 60;

// Entscheidet je Verein selbst, was fällig ist (Struktur ~täglich, Spiele
// spieltagsnah ~45 Min, sonst ~6 Std., siehe sync-cron.ts) — der Cron kann
// daher beliebig oft laufen, ein zu früher Aufruf macht schlicht nichts.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const ergebnisse = await synchronisiereFaellige({
    db: adminDb,
    holeHtml: holeNuligaHtml,
    budgetMs: 40_000,
  });
  return Response.json({ synchronisiert: ergebnisse.length, ergebnisse });
}
