import { pruefeCronSecret } from "@/lib/cron-auth";
import { setzeDemoVereinZurueck } from "@/lib/demo-verein";

export const maxDuration = 60;

// Nachts: der öffentliche Demo-Verein (/demo) wird gelöscht und mit frischen Testdaten neu angelegt — alles, was Besucher am Tag geändert haben, ist
// weg, und die Spiele liegen wieder in der Zukunft.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  return Response.json(await setzeDemoVereinZurueck());
}
