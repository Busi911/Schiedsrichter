import { pruefeCronSecret } from "@/lib/cron-auth";
import { uebernehmeAnsetzungen } from "@/lib/liga-ansetzung";
import { uebernehmeHandballNetAnsetzungen } from "@/lib/liga-ansetzung-hnet";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeNuligaHtml } from "@/lib/nuliga/client";

export const maxDuration = 60;

// Übernimmt die angesetzten Schiedsrichter (nuLiga: Kürzel; handball.net: Schiedsrichter und
// Zeitnehmer mit Namen) aus den öffentlichen Daten in die verknüpften Termine (siehe
// lib/liga-ansetzung.ts und lib/liga-ansetzung-hnet.ts). Eigener Cron, weil nuLiga bewusst
// langsam abgefragt wird (Mindestabstand je Request): je Lauf kommen so viele Gruppen dran, wie
// in die Frist passen; die am längsten ungeprüften zuerst. handball.net hat eine eigene,
// spätere Frist, damit es nicht von nuLiga verdrängt wird.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  const start = Date.now();
  const nuliga = await uebernehmeAnsetzungen({ holeHtml: holeNuligaHtml, frist: start + 30_000 });
  const handballNet = await uebernehmeHandballNetAnsetzungen({ holeJson: holeHandballNetApi, frist: start + 45_000 });
  return Response.json({ nuliga, handballNet });
}
