import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { holeEigeneKalenderEintraege } from "./eigener-kalender";
import { holeKalenderErgaenzung } from "./kalender-ergaenzung";
import { parseKalenderArten } from "./kalender-arten";
import { mischeNachZeit } from "./kalender";
import { sendMail } from "./mailer";
import { abmeldeInfo } from "./abmelden";
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
  // Training und Vereinstermine (Gesamtkalender): der Name steht im Label, nicht im Typ.
  if (e.art === "training") return `${e.zeit} · Training ${e.label}${e.ausgefallen ? " — FÄLLT AUS" : ""}${e.ort ? ` (${e.ort})` : ""}`;
  if (e.art === "vereinstermin") return `${e.zeit} · ${e.typLabel}: ${e.label}${e.ort ? ` (${e.ort})` : ""}`;
  const zusatz = [e.mannschaftLabel, e.ort].filter(Boolean).join(" · ");
  return `${e.zeit} · ${e.typLabel}${zusatz ? ` (${zusatz})` : ""}`;
}

// Regelmäßige Trainings allein sind keine Neuigkeit (sonst bekäme jeder Trainer jede Woche eine Mail): ein Digest geht nur raus, wenn es Einsätze, Vereinstermine
// oder ein ausfallendes Training gibt. Dann stehen auch die regulären Trainings der Woche mit drin.
export function istDigestNeuigkeit(e: KalenderEintrag): boolean {
  return e.art !== "training" || !!e.ausgefallen;
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
    ueberschrift: `Deine Termine in den nächsten ${TAGE_VORAUS} Tagen (${anzahlEinsaetze}).`,
    zeilen,
    cta: { text: "Zu meinem Kalender", url: `${appUrl()}/profil` },
  };
}

// Wöchentlicher Digest an alle Personen mit mindestens einem Einsatz in den
// nächsten TAGE_VORAUS Tagen — wer nichts eingetragen hat, bekommt auch
// keine Mail (kein Digest mit "Du hast diese Woche nichts zu tun"). Wer den
// Digest auf /profil deaktiviert hat (users.wochenDigestAktiviert), wird
// schon in der Query ausgeschlossen.
export async function sendeWochenDigests() {
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + TAGE_VORAUS * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany();
  let versendet = 0;
  const fehler: { userId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    const vereinsUsers = await adminDb
      .select({ id: users.id, email: users.email, istAdmin: users.istAdmin, istAdminLesend: users.istAdminLesend })
      .from(users)
      .where(and(eq(users.vereinId, verein.id), eq(users.wochenDigestAktiviert, true)));

    for (const user of vereinsUsers) {
      try {
        const eigene = await holeEigeneKalenderEintraege(verein.id, user.id, jetzt, bis);
        // Zusätzlich Trainings (Trainer: die ihrer Mannschaften) und Vereinstermine, die die Person sehen darf (lib/kalender-ergaenzung.ts).
        const ergaenzung = await holeKalenderErgaenzung({
          vereinId: verein.id,
          userId: user.id,
          istAdmin: user.istAdmin,
          istAdminLesend: user.istAdminLesend,
          von: jetzt,
          bis,
          arten: parseKalenderArten(undefined),
          ansicht: "profil",
        });
        const hatNeuigkeit = eigene.size > 0 || [...ergaenzung.eintraege.values()].flat().some(istDigestNeuigkeit);
        if (!hatNeuigkeit) continue;
        const eintraegeProTag = mischeNachZeit(eigene, ergaenzung.eintraege);

        const inhalt = { ...digestInhalt(verein.name, eintraegeProTag), abmelden: abmeldeInfo(user.id, "digest") };
        await sendMail(
          user.email,
          `Deine Woche bei ${verein.name}`,
          emailAlsText(inhalt),
          emailAlsHtml(inhalt),
          { abmeldeUrl: inhalt.abmelden.url }
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
