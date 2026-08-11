import { and, eq, isNotNull, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { schiedsrichterProfile, users } from "@/db/schema";
import { syncSchiedsrichterIcsFeed } from "@/lib/ics-sync";
import { synchronisiereAlleAktivenNuligaVereine } from "@/lib/rundenspiel-sync";

// Läuft täglich per Vercel Cron (siehe vercel.json). Nutzt adminDb NUR zum
// vereinsübergreifenden Auflisten der Kandidaten — der eigentliche Sync pro
// Schiedsrichter läuft über withTenant() (siehe src/lib/ics-sync.ts) und
// bleibt damit RLS-konform.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const kandidaten = await adminDb
    .select({
      userId: schiedsrichterProfile.userId,
      vereinId: users.vereinId,
    })
    .from(schiedsrichterProfile)
    .innerJoin(users, eq(schiedsrichterProfile.userId, users.id))
    .where(
      and(
        isNotNull(schiedsrichterProfile.icsFeedUrl),
        ne(schiedsrichterProfile.icsFeedUrl, "")
      )
    );

  const ergebnisse = [];
  for (const kandidat of kandidaten) {
    if (!kandidat.vereinId) continue;
    try {
      const result = await syncSchiedsrichterIcsFeed(
        kandidat.vereinId,
        kandidat.userId
      );
      ergebnisse.push({ userId: kandidat.userId, status: "ok", ...result });
    } catch (err) {
      ergebnisse.push({
        userId: kandidat.userId,
        status: "fehler",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Läuft montags/donnerstags mit, statt einen eigenen Cron-Eintrag zu
  // bekommen (siehe Kommentar in rundenspiel-sync.ts). Wochentag in UTC
  // geprüft — der Cron feuert zu einer festen UTC-Stunde, die auch in
  // Europe/Berlin zuverlässig auf denselben Kalendertag fällt.
  const wochentag = new Date().getUTCDay(); // 0=So, 1=Mo, ..., 4=Do
  const nuligaErgebnisse =
    wochentag === 1 || wochentag === 4
      ? await synchronisiereAlleAktivenNuligaVereine()
      : [];

  return Response.json({
    synchronisiert: ergebnisse.length,
    ergebnisse,
    nuligaSynchronisiert: nuligaErgebnisse.length,
    nuligaErgebnisse,
  });
}
