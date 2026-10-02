import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeOffenePosten, type OffenePosten } from "./dashboard";
import { sendMail } from "./mailer";
import { abmeldeInfo } from "./abmelden";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang } from "./format";
import { appUrl } from "./app-url";

const FENSTER_TAGE = 3;

type Rolle = OffenePosten["luecken"][number]["rolle"];
type FunktionstraegerTyp = typeof funktionstraegerRollen.$inferSelect.typ;

const ROLLE_LABEL: Record<Rolle, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  zeitnehmer: "Zeitnehmer/Sekretär",
};

// "zeitnehmer" in OffenePosten.luecken bündelt den gemeinsam gezählten
// Bedarf von funktionstraegerRollen.typ "zeitnehmer" UND "sekretaer" (siehe
// berechneOffenePosten in dashboard.ts) — beim Ermitteln der Empfänger
// müssen deshalb beide DB-Rollentypen abgefragt werden, nicht nur einer.
const ROLLE_ZU_FUNKTIONSTRAEGER_TYPEN: Record<Rolle, readonly FunktionstraegerTyp[]> = {
  ordner: ["ordner"],
  kioskdienst: ["kioskdienst"],
  kassierer: ["kassierer"],
  zeitnehmer: ["zeitnehmer", "sekretaer"],
};

export function offenerPostenBroadcastZeile(p: OffenePosten): string {
  const zusatz = [p.mannschaftLabel, p.ort].filter(Boolean).join(" · ");
  return `${formatDatumZeitLang(p.start)}${zusatz ? ` · ${zusatz}` : ""}`;
}

export function offeneDiensteBroadcastInhalt(
  vereinName: string,
  rolleLabel: string,
  termine: OffenePosten[]
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `Als ${rolleLabel} noch gesucht: ${termine.length} Termin${termine.length === 1 ? "" : "e"} in den nächsten ${FENSTER_TAGE} Tagen.`,
    zeilen: termine.map(offenerPostenBroadcastZeile),
    cta: { text: "Zur Dienste-Übersicht", url: `${appUrl()}/profil` },
    kleingedrucktes:
      "Du bekommst diese Mail, weil du diese Rolle im Verein innehast. Abschaltbar in deinen Benachrichtigungs-Einstellungen.",
  };
}

// Ergänzt sendeOffenePostenErinnerungen (dienste-erinnerung.ts, an ALLE
// Admins) um einen zweiten, per Verein OPT-IN aktivierbaren Kanal (siehe
// vereine.offeneDiensteBroadcastAktiviert): informiert bei akut
// unbesetztem Ordner-/Kioskdienst-/Kassierer-/Zeitnehmer-/Sekretär-Bedarf
// nicht nur die Admins, sondern ALLE aktiven Inhaber der jeweils
// betroffenen Rolle — die Idee ist "wer kann kurzfristig einspringen",
// nicht nur "der Admin soll sich kümmern". Pro Rolle EINE Sammel-Mail
// (nicht pro Termin), damit jemand bei mehreren offenen Terminen nicht
// mehrfach angeschrieben wird.
export async function sendeOffeneDiensteBroadcast() {
  const jetzt = new Date();
  const grenze = new Date(jetzt.getTime() + FENSTER_TAGE * 24 * 60 * 60 * 1000);

  const alleVereine = await adminDb.query.vereine.findMany({
    where: (v, { eq }) => eq(v.offeneDiensteBroadcastAktiviert, true),
  });
  let versendet = 0;
  const fehler: { vereinId: string; message: string }[] = [];

  for (const verein of alleVereine) {
    try {
      const offenePosten = await holeOffenePosten(verein.id);
      const baldOffen = offenePosten.filter((p) => p.start <= grenze);
      if (baldOffen.length === 0) continue;

      const terminProRolle = new Map<Rolle, OffenePosten[]>();
      for (const p of baldOffen) {
        for (const l of p.luecken) {
          const liste = terminProRolle.get(l.rolle) ?? [];
          liste.push(p);
          terminProRolle.set(l.rolle, liste);
        }
      }

      for (const [rolle, termine] of terminProRolle) {
        const rolleninhaber = await adminDb
          .select({ id: users.id, email: users.email })
          .from(funktionstraegerRollen)
          .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
          .where(
            and(
              inArray(funktionstraegerRollen.typ, ROLLE_ZU_FUNKTIONSTRAEGER_TYPEN[rolle]),
              eq(funktionstraegerRollen.aktiv, true),
              eq(users.vereinId, verein.id),
              eq(users.offeneDiensteBroadcastAktiviert, true)
            )
          );
        if (rolleninhaber.length === 0) continue;

        const inhalt = offeneDiensteBroadcastInhalt(verein.name, ROLLE_LABEL[rolle], termine);
        const betreff = `${ROLLE_LABEL[rolle]} gesucht: ${termine.length} unbesetzter Termin${termine.length === 1 ? "" : "e"}`;
        for (const person of rolleninhaber) {
          const mitAbmeldung = { ...inhalt, abmelden: abmeldeInfo(person.id, "broadcast") };
          await sendMail(person.email, betreff, emailAlsText(mitAbmeldung), emailAlsHtml(mitAbmeldung), {
            abmeldeUrl: mitAbmeldung.abmelden.url,
          });
          versendet++;
        }
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
