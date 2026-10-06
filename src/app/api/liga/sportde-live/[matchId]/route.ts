import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { ligaSpiele } from "@/db/schema";
import { holeSportDeLive } from "@/lib/sources/sportde/live-cache";

// Einfacher Live-Stand eines Bundesliga-Spiels aus der Liveticker-Seite von sport.de. Nur für Spiele, die wir selbst führen und die rund um den
// Anwurf liegen (30 Minuten davor bis 4 Stunden danach) — kein offener Proxy auf sport.de; kurz zwischengespeichert (live-cache.ts + CDN).
// Es werden nur Status, Minute, Stand und Halbzeitstand geliefert, keine Ereignisse und keine Spielernamen.
const ID = /^ma\d{3,12}$/;
const PFAD = /^\/handball\/[a-z0-9\-]+\/ma\d+\/(?:[a-z0-9_\-]+\/)?$/;
const VOR_MS = 30 * 60_000;
const NACH_MS = 4 * 60 * 60_000;

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  if (!ID.test(matchId)) return Response.json({ fehler: "ungültig" }, { status: 400 });
  const spiel = await mitColdStartRetry(() =>
    adminDb.query.ligaSpiele.findFirst({
      where: and(eq(ligaSpiele.quelle, "sportde"), eq(ligaSpiele.externeId, matchId)),
      columns: { beginn: true, berichtUrl: true },
    })
  );
  const jetzt = Date.now();
  if (!spiel?.beginn || !spiel.berichtUrl || !PFAD.test(spiel.berichtUrl) || jetzt < spiel.beginn.getTime() - VOR_MS || jetzt > spiel.beginn.getTime() + NACH_MS) {
    return Response.json({ stand: null }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
  const live = await holeSportDeLive(matchId, spiel.berichtUrl, jetzt);
  const stand = live
    ? { status: live.status, minute: live.minute, heimTore: live.homeScore, gastTore: live.awayScore, halbzeitHeim: live.halftimeHomeScore, halbzeitGast: live.halftimeAwayScore }
    : null;
  const sekunden = live?.status === "live" ? 10 : live?.status === "halftime" ? 25 : 60;
  return Response.json({ stand }, { headers: { "Cache-Control": `public, s-maxage=${sekunden}, stale-while-revalidate=${sekunden}` } });
}
