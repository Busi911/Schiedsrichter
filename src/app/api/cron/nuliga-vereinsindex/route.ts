import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { aktualisiereVereinsindex } from "@/lib/nuliga/vereinsindex";
import { VERBAENDE } from "@/lib/nuliga/verbaende";

export const maxDuration = 60;

// Täglich: Liste aller Vereine aller konfigurierten Verbände (Vereinssuche)
// neu einlesen — Grundlage für die Suche beim Einrichten neuer Vereine.
// Wenige Seiten (Startseite + je Bezirk), strikt sequenziell; reicht die Frist
// nicht, bleibt der Rest für den nächsten Lauf (ein Teillauf löscht nie Einträge).
// Mit ?verband=XXX wird nur dieser eine Verband aktualisiert (für Testläufe).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const verbandParam = params.get("verband");

  const verbände = verbandParam
    ? [verbandParam]
    : Object.keys(VERBAENDE);

  const ergebnisse: Record<string, unknown> = {};
  for (const verband of verbände) {
    if (!VERBAENDE[verband]) {
      ergebnisse[verband] = { fehler: `Unbekannter Verband "${verband}"` };
      continue;
    }
    try {
      const ergebnis = await aktualisiereVereinsindex({
        db: adminDb,
        holeHtml: holeNuligaHtml,
        verband,
        frist: Date.now() + 45_000,
      });
      ergebnisse[verband] = ergebnis;
    } catch (err) {
      ergebnisse[verband] = {
        fehler: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return Response.json(ergebnisse);
}
