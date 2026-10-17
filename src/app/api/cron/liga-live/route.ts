import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { synchronisiereLiveFenster } from "@/lib/nuliga/live-fenster";

export const maxDuration = 60;

// Live-Fenster: lädt nur die Mannschaften, die gerade (30 Min vor bis 3 h nach dem Anwurf) ein Spiel haben und deren
// Spielbericht-Link bzw. Endstand noch fehlt (siehe lib/nuliga/live-fenster.ts). Läuft alle 5 Minuten tagsüber; der stündliche
// Liga-Sync (/api/cron/liga-sync) bleibt unverändert und wird dadurch nicht als "frisch" markiert. Ohne passendes Spiel macht der
// Lauf nichts (keine nuLiga-Abrufe).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const ergebnis = await synchronisiereLiveFenster({
      db: adminDb,
      holeHtml: holeNuligaHtml,
      frist: Date.now() + 40_000,
    });
    return Response.json(ergebnis);
  } catch (err) {
    console.error("[liga-live] Fehler:", err);
    return Response.json({ fehler: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
