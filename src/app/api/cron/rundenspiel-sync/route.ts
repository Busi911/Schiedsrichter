import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { synchronisiereNuligaHallen } from "@/lib/rundenspiel-sync";

// Läuft montags + donnerstags per Vercel Cron (siehe vercel.json). Nutzt
// adminDb NUR zum vereinsübergreifenden Auflisten der aktivierten Vereine —
// der eigentliche Import läuft über withTenant() (siehe
// synchronisiereNuligaHallen -> importiereRundenspielEreignisse) und bleibt
// damit RLS-konform.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const kandidaten = await adminDb.query.vereine.findMany({
    where: eq(vereine.nuligaAutoImportAktiviert, true),
  });

  const ergebnisse = [];
  for (const verein of kandidaten) {
    const hallenIds = [
      verein.nuligaHalle1Id,
      verein.nuligaHalle2Id,
      verein.nuligaHalle3Id,
    ].filter((id): id is string => id !== null);
    if (hallenIds.length === 0) continue;

    try {
      const ergebnis = await synchronisiereNuligaHallen(verein.id, hallenIds);
      ergebnisse.push({ vereinId: verein.id, status: "ok", ...ergebnis });
    } catch (err) {
      ergebnisse.push({
        vereinId: verein.id,
        status: "fehler",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ synchronisiert: ergebnisse.length, ergebnisse });
}
