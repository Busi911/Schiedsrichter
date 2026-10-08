import { fuehreOutreachAus, fuehreOutreachFollowupAus } from "@/lib/vereins-outreach";

export const maxDuration = 300;

// Täglicher Outreach-Cron: Findet neue Vereine aus dem nuLiga-Index, richtet
// sie ein, sucht die E-Mail aus dem Impressum und sendet die Ansprache-Mail.
// Maximal 10 Vereine pro Lauf (Throttling/Anti-Spam).
// Mit ?followup=1 werden stattdessen Followup-Mails für Vereine verschickt,
// die vor >7 Tagen angeschrieben wurden und noch nicht reagiert haben.
//
// VORÜBERGEHEND ohne Auth-Prüfung — wird wieder aktiviert, sobald CRON_SECRET
// in Vercel korrekt gesetzt ist. Siehe lib/cron-auth.ts.
export async function GET(request: Request) {
  // const { pruefeCronSecret } = await import("@/lib/cron-auth");
  // const unauthorized = pruefeCronSecret(request);
  // if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const followup = params.get("followup") === "1";

  if (followup) {
    const ergebnis = await fuehreOutreachFollowupAus();
    return Response.json({ followup: ergebnis });
  }

  const ergebnis = await fuehreOutreachAus();
  return Response.json({ outreach: ergebnis });
}
