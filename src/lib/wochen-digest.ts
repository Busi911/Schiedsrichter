import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { holeEigeneKalenderEintraege } from "./eigener-kalender";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatWochentagDatum } from "./format";
import { appUrl } from "./app-url";
import type { KalenderEintrag } from "@/components/monats-kalender";

// Ergänzt die 24h-Erinnerung (terminerinnerungen.ts, EIN Termin) um eine
// wöchentliche Vorschau — z.B. für jemanden mit mehreren Einsätzen in der
// Woche praktischer als mehrere Einzel-Erinnerungen kurz vorher.
const TAGE_VORAUS = 7;

// tagKey (siehe eigener-kalender.ts/kalender.ts) liefert "YYYY-MM-DD" in
// Berlin-Ortszeit — hier zurück in ein Datum für die Anzeige, UTC-Mittag
// gewählt, damit die Berlin-Formatierung nie auf den Vor-/Folgetag rutscht.
function tagLabel(tagKeyWert: string): string {
  const [jahr, monat, tag] = tagKeyWert.split("-").map(Number);
  return formatWochentagDatum(new Date(Date.UTC(jahr, monat - 1, tag, 12)));
}

function eintragZeile(e: KalenderEintrag): string {
  const zusatz = [e.mannschaftLabel, e.ort].filter(Boolean).join(" · ");
  return `${e.zeit} · ${e.typLabel}${zusatz ? ` (${zusatz})` : ""}`;
}

export function digestInhalt(
  vereinName: string,
  eintraegeProTag: Map<string, KalenderEintrag[]>
): EmailInhalt {
  const tage = [...eintraegeProTag.keys()].sort();
  const zeilen = tage.flatMap((tag) => [
    tagLabel(tag),
    ...eintraegeProTag.get(tag)!.map((e) => `  ${eintragZeile(e)}`),
  ]);
  const anzahlEinsaetze = tage.reduce(
    (summe, tag) => summe + eintraegeProTag.get(tag)!.length,
    0
  );
  return {
    vereinName,
    ueberschrift: `Deine Einsätze in den nächsten ${TAGE_VORAUS} Tagen (${anzahlEinsaetze}).`,
    zeilen,
    cta: { text: "Zu meinem Kalender", url: `${appUrl()}/profil` },
  };
}

// Wöchentlicher Digest an alle Personen mit mindestens einem Einsatz in den
// nächsten TAGE_VORAUS Tagen — wer nichts eingetragen hat, bekommt auch
// keine Mail (kein Digest mit "Du hast diese Woche nichts zu tun").
export async function sendeWochenDigests() {
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + TAGE_VORAUS * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany();
  let versendet = 0;
  const fehler: { userId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    const vereinsUsers = await adminDb
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.vereinId, verein.id));

    for (const user of vereinsUsers) {
      try {
        const eintraegeProTag = await holeEigeneKalenderEintraege(
          verein.id,
          user.id,
          jetzt,
          bis
        );
        if (eintraegeProTag.size === 0) continue;

        const inhalt = digestInhalt(verein.name, eintraegeProTag);
        await sendMail(
          user.email,
          `Deine Einsätze diese Woche bei ${verein.name}`,
          emailAlsText(inhalt),
          emailAlsHtml(inhalt)
        );
        versendet++;
      } catch (err) {
        fehler.push({
          userId: user.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { vereineGeprueft: alleVereine.length, versendet, fehler };
}
