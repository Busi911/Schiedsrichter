import { pruefeCronSecret } from "@/lib/cron-auth";
import { synchronisiereHblLigen } from "@/lib/sources/hbl/lauf";

export const maxDuration = 60;

// Tabelle und Spielplan der 1./2. HBL (öffentliche HTML-Seiten); mit ?teams=1 zusätzlich die Teamübersicht (Logos, Namen) — nachts.
// Tut nichts, solange kein HBL-Team einem Verein zugeordnet ist (/system/hbl).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const mitTeams = new URL(request.url).searchParams.get("teams") === "1";
  const ergebnisse = await synchronisiereHblLigen({ mitTeams });
  return Response.json({ ergebnisse });
}
