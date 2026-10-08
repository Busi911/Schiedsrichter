import { pruefeCronSecret } from "@/lib/cron-auth";
import { fuehreOutreachAus, fuehreOutreachFollowupAus, fuehreInstagramNachfassAus, resetOutreachVerein } from "@/lib/vereins-outreach";

export const maxDuration = 300;

// Täglicher Outreach-Cron: Findet neue Vereine aus dem nuLiga-Index, richtet
// sie ein, sucht die E-Mail aus dem Impressum und sendet die Ansprache-Mail.
// Maximal 5 Vereine pro Lauf (Throttling/Anti-Spam).
// Mit ?followup=1 werden stattdessen Followup-Mails verschickt.
// Mit ?instagram=1 werden Vereine, die per Instagram angeschrieben wurden,
// per E-Mail nachgefasst (mit Hinweis auf den vorherigen Instagram-Kontakt).
// Mit ?reset=clubId wird ein einzelner Verein zurückgesetzt und neu angeschrieben
// (temporär für Korrekturen — löscht den Verein samt Daten und legt ihn neu an).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const followup = params.get("followup") === "1";
  const instagram = params.get("instagram") === "1";
  const reset = params.get("reset");

  if (reset) {
    const ergebnis = await resetOutreachVerein(reset);
    return Response.json({ reset: ergebnis });
  }

  if (followup) {
    const ergebnis = await fuehreOutreachFollowupAus();
    return Response.json({ followup: ergebnis });
  }

  if (instagram) {
    const ergebnis = await fuehreInstagramNachfassAus();
    return Response.json({ instagram: ergebnis });
  }

  const ergebnis = await fuehreOutreachAus();
  return Response.json({ outreach: ergebnis });
}
