import { and, eq, isNotNull, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { schiedsrichterProfile, users } from "@/db/schema";
import { syncSchiedsrichterIcsFeed } from "@/lib/ics-sync";
import { synchronisiereAlleAktivenNuligaVereine } from "@/lib/rundenspiel-sync";
import { sendeAusstehendeErinnerungen } from "@/lib/terminerinnerungen";

// Einziger registrierter Vercel Cron (siehe vercel.json) — der Hobby-Plan
// begrenzt Projekte auf zwei Cron Jobs insgesamt, und schon zwei Einträge
// ließen das Deployment weiterhin fehlschlagen (ohne dass Vercel dafür einen
// spezifischen Fehlertext lieferte wie beim Frequenz-Limit). Statt weiter zu
// raten, läuft hier bewusst alles Tägliche in einer einzigen Route:
// ICS-Sync, danach Terminerinnerungen (braucht die frisch synchronisierten
// ics_feed-Termine), danach montags/donnerstags der nuLiga-Sync.
// /api/cron/terminerinnerungen und /api/cron/rundenspiel-sync bleiben als
// eigene, manuell auslösbare Endpunkte bestehen, sind aber nicht mehr in
// vercel.json registriert.
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

  const erinnerungenErgebnis = await sendeAusstehendeErinnerungen();

  // Wochentag in UTC geprüft — der Cron feuert zu einer festen UTC-Stunde,
  // die auch in Europe/Berlin zuverlässig auf denselben Kalendertag fällt.
  const wochentag = new Date().getUTCDay(); // 0=So, 1=Mo, ..., 4=Do
  const nuligaErgebnisse =
    wochentag === 1 || wochentag === 4
      ? await synchronisiereAlleAktivenNuligaVereine()
      : [];

  return Response.json({
    synchronisiert: ergebnisse.length,
    ergebnisse,
    erinnerungen: erinnerungenErgebnis,
    nuligaSynchronisiert: nuligaErgebnisse.length,
    nuligaErgebnisse,
  });
}
