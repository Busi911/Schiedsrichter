import { synchronisiereAlleAktivenNuligaVereine } from "@/lib/rundenspiel-sync";
import { synchronisiereAlleAktivenHandballNetMannschaften } from "@/lib/handball-net-sync";
import { pruefeCronSecret } from "@/lib/cron-auth";

// Läuft täglich per Vercel Cron (siehe vercel.json). Zwei unabhängige
// Quellen: nuLiga (Verein-weit, je Hallen-ID) für die regulären Ligen und
// handball.net (je Mannschaft, Team-ID) ab der 3. Liga, wo es nuLiga gar
// nicht abdeckt (siehe handball-net-scraper.ts) — ein Fehler in der einen
// Quelle darf den Sync der anderen nicht verhindern.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const [nuliga, handballNet] = await Promise.all([
    synchronisiereAlleAktivenNuligaVereine(),
    synchronisiereAlleAktivenHandballNetMannschaften(),
  ]);

  return Response.json({
    nuliga: { synchronisiert: nuliga.length, ergebnisse: nuliga },
    handballNet: { synchronisiert: handballNet.length, ergebnisse: handballNet },
  });
}
