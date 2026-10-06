import { adminDb } from "@/db/admin";
import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { aktualisiereVereinsindex } from "@/lib/nuliga/vereinsindex";

export const maxDuration = 60;

// Täglich: Liste aller Vereine des Verbands (Vereinssuche) neu einlesen — Grundlage für die Suche beim
// Einrichten neuer Vereine. Wenige Seiten (Startseite + je Bezirk), strikt sequenziell; reicht die Frist
// nicht, bleibt der Rest für den nächsten Lauf (ein Teillauf löscht nie Einträge).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const ergebnis = await aktualisiereVereinsindex({ db: adminDb, holeHtml: holeNuligaHtml, frist: Date.now() + 45_000 });
  return Response.json(ergebnis);
}
