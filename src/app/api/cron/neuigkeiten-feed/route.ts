import { pruefeCronSecret } from "@/lib/cron-auth";
import { aktualisiereNeuigkeiten, holeVereineFuerFeedAbruf } from "@/lib/neuigkeiten-daten";

export const maxDuration = 60;

// Stündlich (tagsüber): die abonnierten Feeds der Vereinshomepages abrufen (Einstellungen → Neuigkeiten). Je Lauf höchstens 15 Vereine,
// die am längsten nicht abgerufenen zuerst, Frist 40 s; ein Fehler bei einem Verein hält die anderen nicht auf.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const frist = Date.now() + 40_000;
  const ergebnis = { geprueft: 0, fehler: 0, uebersprungen: 0 };
  for (const vereinId of await holeVereineFuerFeedAbruf(15)) {
    if (Date.now() > frist) {
      ergebnis.uebersprungen++;
      continue;
    }
    const r = await aktualisiereNeuigkeiten(vereinId);
    ergebnis.geprueft++;
    if (!r.ok) ergebnis.fehler++;
  }
  return Response.json(ergebnis);
}
