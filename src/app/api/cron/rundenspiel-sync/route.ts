import { synchronisiereAlleAktivenNuligaVereine } from "@/lib/rundenspiel-sync";

// Läuft montags + donnerstags per Vercel Cron (siehe vercel.json).
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
