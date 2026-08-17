import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine } from "@/db/schema";
import { generiereIcsFeed, holeEigeneTermineFuerIcsExport } from "@/lib/kalender-ics";

// Öffentlicher, login-freier ICS-Feed für Kalender-Apps (siehe
// users.kalenderToken) — analog zu /turnier/[token] und
// /zeitnehmer-eintragen/[token]: Kenntnis des Tokens ist die Berechtigung.
// Bewusst adminDb für den Token-Lookup (kein Session vorhanden, Kalender-
// Apps rufen das anonym und regelmäßig ab), danach withTenant innerhalb von
// holeEigeneTermineFuerIcsExport.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const user = await adminDb.query.users.findFirst({
    where: eq(users.kalenderToken, token),
  });
  if (!user || !user.vereinId) {
    return new Response("Ungültiger oder nicht mehr aktiver Link.", {
      status: 404,
    });
  }

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.id, user.vereinId),
  });

  const termine = await holeEigeneTermineFuerIcsExport(user.vereinId, user.id);
  const feed = generiereIcsFeed(verein?.name ?? "HandballerPate", termine);

  return new Response(feed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="kalender.ics"',
      // Kurzes Caching statt "immer live" — Kalender-Apps fragen ohnehin nur
      // periodisch ab (typischerweise stündlich bis täglich), ein frisches
      // Ergebnis bei jedem einzelnen Abruf ist nicht nötig.
      "Cache-Control": "private, max-age=1800",
    },
  });
}
