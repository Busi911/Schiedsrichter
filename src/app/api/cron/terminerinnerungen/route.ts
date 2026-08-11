import { sendeAusstehendeErinnerungen } from "@/lib/terminerinnerungen";

// Kein eigener Vercel-Cron-Eintrag mehr — läuft im ics-sync-Cron mit (siehe
// Kommentar dort). Bleibt als eigener, manuell auslösbarer Endpunkt
// bestehen, z.B. zum Testen:
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/terminerinnerungen
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendeAusstehendeErinnerungen();
  return Response.json(result);
}
