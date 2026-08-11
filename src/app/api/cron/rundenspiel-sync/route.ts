import { synchronisiereAlleAktivenNuligaVereine } from "@/lib/rundenspiel-sync";

// Kein eigener Vercel-Cron-Eintrag mehr (siehe Kommentar in rundenspiel-sync.ts) —
// läuft montags/donnerstags über /api/cron/ics-sync mit. Diese Route bleibt
// als manuell auslösbarer Endpunkt bestehen, z.B. zum Testen:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/rundenspiel-sync
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ergebnisse = await synchronisiereAlleAktivenNuligaVereine();
  return Response.json({ synchronisiert: ergebnisse.length, ergebnisse });
}
