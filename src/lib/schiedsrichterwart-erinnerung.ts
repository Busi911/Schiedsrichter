import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeOffeneSchiedsrichterTermine, type OffenerSchiedsrichterTermin } from "./dashboard";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

// Analog zu FENSTER_TAGE in dienste-erinnerung.ts (dort Ordner/Kioskdienst/
// Zeitnehmer an alle Admins) — hier derselbe Rhythmus, aber gezielt an die
// Schiedsrichterwart-Rolle und nur für den Schiedsrichter-Bedarf, den
// /profil/schiedsrichterwart verwaltet. Bewusst KEIN Dedup wie bei
// ERINNERUNG_TYP in terminerinnerungen.ts, da eine noch unbesetzte Rolle so
// lange wie sinnvoll in Erinnerung bleiben soll.
const FENSTER_TAGE = 3;

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

export function offenerSchiedsrichterTerminZeile(t: OffenerSchiedsrichterTermin): string {
  const zusatz = [TYP_LABEL[t.typ] ?? t.typ, t.mannschaftLabel, t.ort]
    .filter(Boolean)
    .join(" · ");
  return `${formatDatumZeitLang(t.start)} — ${zusatz}`;
}

export function offeneSchiedsrichterInhalt(
  vereinName: string,
  termine: OffenerSchiedsrichterTermin[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `${termine.length} Spiel${termine.length === 1 ? "" : "e"} in den nächsten ${FENSTER_TAGE} Tagen noch ohne Schiedsrichter.`,
    zeilen: termine.map(offenerSchiedsrichterTerminZeile),
    cta: { text: "Zur Schiedsrichter-Übersicht", url: `${appUrl()}/profil/schiedsrichterwart` },
  };
}

// Täglicher Digest an alle Schiedsrichterwarte eines Vereins, wenn in den
// nächsten FENSTER_TAGE Tagen noch ein Spiel ohne zugeordneten Schiedsrichter
// ist — ergänzt die rein passive Anzeige auf /profil/schiedsrichterwart um
// eine aktive Erinnerung, damit eine Lücke nicht erst kurzfristig auffällt.
export async function sendeOffeneSchiedsrichterErinnerungen() {
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() + FENSTER_TAGE * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany();
  let versendet = 0;
  const fehler: { vereinId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    try {
      const offeneTermine = await holeOffeneSchiedsrichterTermine(verein.id);
      const baldOffen = offeneTermine.filter((t) => t.start <= grenze);
      if (baldOffen.length === 0) continue;

      const schiedsrichterwarte = await adminDb
        .select({ id: users.id, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(
          and(
            eq(funktionstraegerRollen.typ, "schiedsrichterwart"),
            eq(funktionstraegerRollen.aktiv, true),
            eq(users.vereinId, verein.id),
            eq(users.offeneSchiedsrichterErinnerungAktiviert, true)
          )
        );
      if (schiedsrichterwarte.length === 0) continue;

      const inhalt = offeneSchiedsrichterInhalt(verein.name, baldOffen);
      const betreff = `${baldOffen.length} Spiel${baldOffen.length === 1 ? "" : "e"} ohne Schiedsrichter in den nächsten ${FENSTER_TAGE} Tagen`;
      for (const wart of schiedsrichterwarte) {
        await sendMail(wart.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
        versendet++;
      }
    } catch (err) {
      fehler.push({
        vereinId: verein.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { vereineGeprueft: alleVereine.length, versendet, fehler };
}
