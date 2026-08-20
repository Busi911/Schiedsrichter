import { and, eq, isNotNull, ne } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { schiedsrichterProfile, users } from "@/db/schema";
import { syncSchiedsrichterIcsFeed } from "@/lib/ics-sync";
import { sendeDuplikatBenachrichtigungen } from "@/lib/duplikat-benachrichtigung";

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
  const betroffeneVereinIds = new Set<string>();
  for (const kandidat of kandidaten) {
    if (!kandidat.vereinId) continue;
    try {
      const result = await syncSchiedsrichterIcsFeed(
        kandidat.vereinId,
        kandidat.userId
      );
      ergebnisse.push({ userId: kandidat.userId, status: "ok", ...result });
      betroffeneVereinIds.add(kandidat.vereinId);
    } catch (err) {
      ergebnisse.push({
        userId: kandidat.userId,
        status: "fehler",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Der frische Sync kann neue spiel_ics-Duplikate manuell angelegter Termine
  // aufdecken (siehe duplikat-erkennung.ts) — einmal pro betroffenem Verein
  // direkt danach prüfen, statt auf den nächsten Aufruf von /admin/termine zu
  // warten. Best effort: ein Fehler hier soll die bereits erfolgreichen
  // Syncs oben nicht als "fehler" ausweisen.
  for (const vereinId of betroffeneVereinIds) {
    try {
      await sendeDuplikatBenachrichtigungen(vereinId);
    } catch {
      // ignoriert
    }
  }

  return Response.json({ synchronisiert: ergebnisse.length, ergebnisse });
}
