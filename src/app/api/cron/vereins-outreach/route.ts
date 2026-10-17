import { pruefeCronSecret } from "@/lib/cron-auth";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";
import { begrenzeOutreachProLauf } from "@/lib/outreach-einstellungen";
import { markiereInaktiveVereine } from "@/lib/verein-inaktiv";
import { fuehreOutreachAus, fuehreOutreachFollowupAus, fuehreInstagramNachfassAus, resetOutreachVerein } from "@/lib/vereins-outreach";

export const maxDuration = 300;

// Täglicher Outreach-Cron: Findet neue Vereine aus dem nuLiga-Index, richtet
// sie ein, sucht die E-Mail aus dem Impressum und sendet die Ansprache-Mail.
// Pro Lauf höchstens so viele Vereine, wie der Systemadmin unter /system/ansprache eingestellt hat (Standard 5), oder gar nichts,
// wenn er den Schalter ausgeschaltet hat.
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
  const verband = params.get("verband") ?? undefined;

  if (reset) {
    const ergebnis = await resetOutreachVerein(reset);
    return Response.json({ reset: ergebnis });
  }

  // Schalter des Systemadmins (/system/ansprache): aus = es wird nichts angelegt und nichts verschickt.
  const einstellungen = await holeSystemEinstellungen();

  if (followup) {
    // Das Inaktiv-Setzen verschickt nichts und läuft deshalb immer.
    const ergebnis = einstellungen.outreachNachfassAktiv
      ? await fuehreOutreachFollowupAus()
      : { uebersprungen: "Nachfassen ist ausgeschaltet (/system/ansprache)" };
    // Danach: Vereine ohne Rückmeldung und ohne gültigen Link inaktiv setzen (nie löschen, jederzeit reaktivierbar).
    const inaktiv = await markiereInaktiveVereine();
    return Response.json({ followup: ergebnis, inaktiv });
  }

  if (instagram) {
    if (!einstellungen.outreachNachfassAktiv) {
      return Response.json({ instagram: { uebersprungen: "Nachfassen ist ausgeschaltet (/system/ansprache)" } });
    }
    const ergebnis = await fuehreInstagramNachfassAus();
    return Response.json({ instagram: ergebnis });
  }

  if (!einstellungen.outreachAktiv) {
    return Response.json({ outreach: { uebersprungen: "Ansprache neuer Vereine ist ausgeschaltet (/system/ansprache)" } });
  }
  const ergebnis = await fuehreOutreachAus(verband, begrenzeOutreachProLauf(einstellungen.outreachProLauf));
  return Response.json({ outreach: ergebnis });
}
