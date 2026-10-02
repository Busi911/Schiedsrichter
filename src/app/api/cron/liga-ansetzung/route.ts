import { pruefeCronSecret } from "@/lib/cron-auth";
import { uebernehmeAnsetzungen } from "@/lib/liga-ansetzung";
import { holeNuligaHtml } from "@/lib/nuliga/client";

export const maxDuration = 60;

// Übernimmt das angesetzte Schiedsrichter-Kürzel aus den öffentlichen nuLiga-Seiten in die
// verknüpften Termine (siehe lib/liga-ansetzung.ts). Eigener Cron, weil nuLiga bewusst langsam
// abgefragt wird (Mindestabstand je Request): je Lauf kommen so viele Gruppen dran, wie in die
// Frist passen; die am längsten ungeprüften zuerst.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const lauf = await uebernehmeAnsetzungen({ holeHtml: holeNuligaHtml, frist: Date.now() + 40_000 });
  return Response.json(lauf);
}
