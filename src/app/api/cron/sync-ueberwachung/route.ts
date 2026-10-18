import { pruefeCronSecret } from "@/lib/cron-auth";
import { fuehreUeberwachungAus } from "@/lib/sync-ueberwachung-daten";

export const maxDuration = 30;

// Überwacht die Abgleiche (nuLiga, handball.net, NDR, Übernahme, Ansetzung): meldet Ausfälle per Mail an die Systemadmins (siehe lib/sync-ueberwachung.ts).
// Antwort als JSON, damit auch ein externer Wächter (z.B. Hermes, tägliche Abfrage) den Zustand lesen kann; mit `?nurPruefen=1` ohne Mail und ohne den Meldezustand zu verändern.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const nurPruefen = new URL(request.url).searchParams.get("nurPruefen") === "1";
  try {
    const lauf = await fuehreUeberwachungAus({ nurPruefen });
    return Response.json({
      ok: lauf.befunde.length === 0,
      befunde: lauf.befunde.map((b) => ({ gruppe: b.gruppe, titel: b.titel, betroffen: b.betroffen.length })),
      gemeldet: lauf.gemeldet,
      behoben: lauf.behoben,
      nurPruefen,
    });
  } catch (err) {
    console.error("[sync-ueberwachung] Fehler:", err);
    return Response.json({ ok: false, fehler: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
