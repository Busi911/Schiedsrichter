import { pruefeCronSecret } from "@/lib/cron-auth";
import { fuehreQuellenTestAus } from "@/lib/quellen-test-daten";

export const maxDuration = 60;

// Aktiver Selbsttest der Datenquellen (handball.net, nuLiga/HHV, NDR): ruft je Quelle wenige echte Seiten ab und prüft, ob unsere Parser
// sie noch lesen können (siehe lib/quellen-test.ts). Speichert den Stand; die Überwachung (sync-ueberwachung) meldet anhaltende Fehlschläge.
// `?nurAnzeigen=1`: nur testen und antworten, nichts speichern.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const nurAnzeigen = new URL(request.url).searchParams.get("nurAnzeigen") === "1";
  try {
    const ergebnisse = await fuehreQuellenTestAus({ nurAnzeigen });
    return Response.json({ ok: ergebnisse.every((e) => e.ok), ergebnisse });
  } catch (err) {
    console.error("[quellen-test] Fehler:", err);
    return Response.json({ ok: false, fehler: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
