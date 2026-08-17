import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeOffeneZeitnehmerTermine, type OffenerZeitnehmerTermin } from "./dashboard";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

// Analog zu FENSTER_TAGE in schiedsrichterwart-erinnerung.ts/dienste-
// erinnerung.ts — derselbe Rhythmus, aber gezielt an die Zeitnehmerwart-
// Rolle und nur für den Zeitnehmer-/Sekretär-Bedarf, den
// /profil/zeitnehmerwart verwaltet. Bewusst KEIN Dedup wie bei
// ERINNERUNG_TYP in terminerinnerungen.ts, da eine noch unbesetzte Rolle so
// lange wie sinnvoll in Erinnerung bleiben soll.
const FENSTER_TAGE = 3;

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

export function offenerZeitnehmerTerminZeile(t: OffenerZeitnehmerTermin): string {
  const zusatz = [TYP_LABEL[t.typ] ?? t.typ, t.mannschaftLabel, t.ort]
    .filter(Boolean)
    .join(" · ");
  return `${formatDatumZeitLang(t.start)} — ${zusatz} (${t.vorhanden}/${t.bedarf} Zeitnehmer/Sekretär)`;
}

export function offeneZeitnehmerInhalt(
  vereinName: string,
  termine: OffenerZeitnehmerTermin[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `${termine.length} Termin${termine.length === 1 ? "" : "e"} in den nächsten ${FENSTER_TAGE} Tagen noch ohne vollständige Zeitnehmer-/Sekretär-Besetzung.`,
    zeilen: termine.map(offenerZeitnehmerTerminZeile),
    cta: { text: "Zur Zeitnehmer-Übersicht", url: `${appUrl()}/profil/zeitnehmerwart` },
  };
}

// Täglicher Digest an alle Zeitnehmerwarte eines Vereins, wenn in den
// nächsten FENSTER_TAGE Tagen noch Zeitnehmer-/Sekretär-Bedarf offen ist —
// analog zu sendeOffeneSchiedsrichterErinnerungen in
// schiedsrichterwart-erinnerung.ts, aber gezielt an die Zeitnehmerwart-Rolle
// statt (wie die generische Dienste-Erinnerung, siehe dienste-
// erinnerung.ts) an alle Admins.
export async function sendeOffeneZeitnehmerErinnerungen() {
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() + FENSTER_TAGE * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany();
  let versendet = 0;
  const fehler: { vereinId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    try {
      const offeneTermine = await holeOffeneZeitnehmerTermine(verein.id);
      const baldOffen = offeneTermine.filter((t) => t.start <= grenze);
      if (baldOffen.length === 0) continue;

      const zeitnehmerwarte = await adminDb
        .select({ id: users.id, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(
          and(
            eq(funktionstraegerRollen.typ, "zeitnehmerwart"),
            eq(funktionstraegerRollen.aktiv, true),
            eq(users.vereinId, verein.id),
            eq(users.offeneZeitnehmerErinnerungAktiviert, true)
          )
        );
      if (zeitnehmerwarte.length === 0) continue;

      const inhalt = offeneZeitnehmerInhalt(verein.name, baldOffen);
      const betreff = `${baldOffen.length} Termin${baldOffen.length === 1 ? "" : "e"} ohne vollständige Zeitnehmer-/Sekretär-Besetzung in den nächsten ${FENSTER_TAGE} Tagen`;
      for (const wart of zeitnehmerwarte) {
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
