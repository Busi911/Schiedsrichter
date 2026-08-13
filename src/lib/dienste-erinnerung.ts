import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { holeOffenePosten, type OffenePosten } from "./dashboard";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

// Fenster für "bald" — Termine mit offenem Bedarf, die weiter in der Zukunft
// liegen, sieht der Admin ohnehin passiv auf /admin/dienste; hier geht es nur
// um akut werdende Lücken. 3 Tage bedeuten höchstens 3 tägliche Erinnerungen
// pro Termin (Tag 3/2/1 vor dem Termin), solange die Lücke besteht — bewusst
// KEIN Dedup wie bei ERINNERUNG_TYP in terminerinnerungen.ts, da eine noch
// unbesetzte Rolle so lange wie sinnvoll in Erinnerung bleiben soll.
const FENSTER_TAGE = 3;

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  zeitnehmer: "Zeitnehmer/Sekretär",
};

export function offenePostenZeile(p: OffenePosten): string {
  const rollenText = p.luecken
    .map((l) => `${ROLLE_LABEL[l.rolle]} ${l.vorhanden}/${l.bedarf}`)
    .join(", ");
  const zusatz = [p.mannschaftLabel, p.ort].filter(Boolean).join(" · ");
  return `${formatDatumZeitLang(p.start)}${zusatz ? ` · ${zusatz}` : ""} — ${rollenText}`;
}

export function offenePostenInhalt(vereinName: string, posten: OffenePosten[]): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `${posten.length} Termin${posten.length === 1 ? "" : "e"} in den nächsten ${FENSTER_TAGE} Tagen noch nicht vollständig besetzt.`,
    zeilen: posten.map(offenePostenZeile),
    cta: { text: "Zur Dienste-Übersicht", url: `${appUrl()}/admin/dienste` },
  };
}

// Täglicher Digest an alle Admins eines Vereins, wenn in den nächsten
// FENSTER_TAGE Tagen noch Ordner-/Kioskdienst- oder Zeitnehmer-/Sekretär-
// Bedarf offen ist — ergänzt die rein passive Anzeige auf /admin/dienste um
// eine aktive Erinnerung, damit eine Lücke nicht erst am Spieltag auffällt.
export async function sendeOffenePostenErinnerungen() {
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() + FENSTER_TAGE * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany();
  let versendet = 0;
  const fehler: { vereinId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    try {
      const offenePosten = await holeOffenePosten(verein.id);
      const baldOffen = offenePosten.filter((p) => p.start <= grenze);
      if (baldOffen.length === 0) continue;

      const admins = await adminDb
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(eq(users.vereinId, verein.id), eq(users.istAdmin, true)));
      if (admins.length === 0) continue;

      const inhalt = offenePostenInhalt(verein.name, baldOffen);
      const betreff = `${baldOffen.length} unbesetzte Dienste in den nächsten ${FENSTER_TAGE} Tagen`;
      for (const admin of admins) {
        await sendMail(admin.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
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
