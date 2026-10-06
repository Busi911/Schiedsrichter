import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { ligaSpiele } from "@/db/schema";
import { holeHblLiveGecacht } from "@/lib/sources/hbl/live-cache";

// Einfacher Live-Stand eines HBL-Spiels aus der öffentlichen Spielseite. Nur für Spiele, die wir selbst führen und die rund um den
// Anwurf liegen (kein offener Proxy auf die HBL-Seite); kurz zwischengespeichert (live-cache.ts + CDN), siehe dort.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOR_MS = 60 * 60 * 1000;
const NACH_MS = 4 * 60 * 60 * 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  if (!UUID.test(matchId)) return Response.json({ fehler: "ungültig" }, { status: 400 });
  const id = matchId.toLowerCase();
  const spiel = await mitColdStartRetry(() =>
    adminDb.query.ligaSpiele.findFirst({
      where: and(eq(ligaSpiele.quelle, "hbl"), eq(ligaSpiele.externeId, id)),
      columns: { beginn: true, ergebnisBestaetigt: true },
    })
  );
  const jetzt = Date.now();
  if (!spiel?.beginn || jetzt < spiel.beginn.getTime() - VOR_MS || jetzt > spiel.beginn.getTime() + NACH_MS) {
    return Response.json({ stand: null }, { headers: { "Cache-Control": "public, s-maxage=30" } });
  }
  const stand = await holeHblLiveGecacht(id, jetzt);
  return Response.json({ stand }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=10" } });
}
