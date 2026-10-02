import { pruefeCronSecret } from "@/lib/cron-auth";
import { uebernehmeFuerAktiveVereine } from "@/lib/liga-uebernahme";

export const maxDuration = 60;

// Legt für Vereine mit eingeschalteter Übernahme fehlende künftige Heimspiele still an
// (siehe lib/liga-uebernahme.ts). Bewusst eigener Cron statt Teil des Liga-Syncs: der
// belegt sein Zeitbudget selbst, die Übernahme rechnet je Verein den vollen Abgleich.
// Läuft zeitversetzt (:30, tagsüber); bei Zeitnot bleibt der Rest für den nächsten Lauf liegen.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const { ergebnis, uebrig } = await uebernehmeFuerAktiveVereine({ frist: Date.now() + 45_000 });
  return Response.json({ geprueft: ergebnis.length, uebrig, ergebnis });
}
