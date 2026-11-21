import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeOffenePosten, type OffenePosten } from "./dashboard";
import { sendMail } from "./mailer";
import { abmeldeInfo } from "./abmelden";
import { emailAlsHtml, emailAlsText, type EmailInhalt, type EmailZeile } from "./email-layout";
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
  // Eigene Dienste haben keine Rolleninhaber (eingeteilt wird jede Person), der Broadcast überspringt sie.
  eigener_dienst: "Helfer",
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
  eigener_dienst: [],
};

export function offenerPostenBroadcastZeile(p: OffenePosten): string {
  const zusatz = [p.mannschaftLabel, p.ort].filter(Boolean).join(" · ");
  return `${formatDatumZeitLang(p.start)}${zusatz ? ` · ${zusatz}` : ""}`;
}

// Öffentlicher Eintragungslink (/eintragen/[token], ohne Login): bevorzugt der Link der Rolle (Zeitnehmer/Sekretär bzw. Ordner/Kiosk/Kassierer),
// sonst irgendein aktiver — die Seite bietet alle Gruppen mit aktivem Token an. null, wenn der Verein keinen Link aktiviert hat.
export function eintragungsTokenFuerRolle(
  rolle: Rolle,
  tokens: { zeitnehmer: string | null; ordner: string | null; dienste: string | null }
): string | null {
  const reihenfolge = rolle === "zeitnehmer" ? [tokens.zeitnehmer, tokens.ordner] : [tokens.ordner, tokens.zeitnehmer];
  return reihenfolge.find((t): t is string => !!t) ?? tokens.dienste ?? null;
}

// Eintragungslink: bei genau EINEM Termin führt er direkt zu diesem Spiel (Termin ist dort schon angetippt, die Seite
// kennt `termin` und `dienst`, siehe app/eintragen/[token]/page.tsx), bei mehreren zur Liste.
export function eintragungsLink(token: string, termine: OffenePosten[], rolle?: Rolle): string {
  const basis = `${appUrl()}/eintragen/${encodeURIComponent(token)}`;
  if (termine.length !== 1) return basis;
  const dienst = rolle && rolle !== "eigener_dienst" ? `&dienst=${rolle}` : "";
  return `${basis}?termin=${encodeURIComponent(termine[0].terminId)}${dienst}`;
}

export function offeneDiensteBroadcastInhalt(
  vereinName: string,
  rolleLabel: string,
  termine: OffenePosten[],
  eintragungToken?: string | null,
  rolle?: Rolle
): EmailInhalt {
  const profilUrl = `${appUrl()}/profil`;
  const einzeln = termine.length === 1;
  // Datum/Uhrzeit fett als Anker, darunter Mannschaft und Halle (vorher eine lange Zeile, die das Handy als Link einfärbte).
  const terminZeilen = termine.flatMap((p, i): EmailZeile[] => {
    const zusatz = [p.mannschaftLabel, p.ort].filter(Boolean).join(" · ");
    return [{ text: formatDatumZeitLang(p.start), stark: true, neueGruppe: i > 0 }, ...(zusatz ? [zusatz] : [])];
  });
  const anleitung = eintragungToken
    ? [
        {
          text: einzeln
            ? "So geht’s: Unten auf „Jetzt eintragen“ tippen. Das Spiel ist dort schon ausgewählt, du bestätigst nur noch mit „Eintragen“."
            : "So geht’s: Unten auf „Termine ansehen“ tippen, die Spiele antippen, bei denen du hilfst, und mit „Eintragen“ bestätigen.",
          neueGruppe: true,
        },
        "Dort kannst du dich mit einem Login-Link per E-Mail anmelden oder dich nur mit deinem Namen eintragen.",
        "Kannst du nicht? Dann musst du nichts tun.",
      ]
    : [
        { text: "So geht’s: Unten auf „Zur Dienste-Übersicht“ tippen, einloggen und dich beim Termin eintragen.", neueGruppe: true },
        "Kannst du nicht? Dann musst du nichts tun.",
      ];
  return {
    vereinName,
    ueberschrift: einzeln
      ? `Kannst du einspringen? Bei diesem Spiel in den nächsten ${FENSTER_TAGE} Tagen fehlt noch ein ${rolleLabel}:`
      : `Kannst du einspringen? Bei diesen ${termine.length} Spielen in den nächsten ${FENSTER_TAGE} Tagen fehlt noch ein ${rolleLabel}:`,
    zeilen: [...terminZeilen, ...anleitung],
    cta: eintragungToken
      ? { text: einzeln ? "Jetzt eintragen" : "Termine ansehen", url: eintragungsLink(eintragungToken, termine, rolle) }
      : { text: "Zur Dienste-Übersicht", url: profilUrl },
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
        if (ROLLE_ZU_FUNKTIONSTRAEGER_TYPEN[rolle].length === 0) continue;
        const kandidaten = await adminDb
          .select({ id: users.id, email: users.email, istAdmin: users.istAdmin, adminHinweise: users.adminHinweiseAktiviert })
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
        // Eine Person kann mehrere Rollenzeilen haben (Zeitnehmer UND Sekretär): nur EINE Mail je Person.
        // Wer als Admin ohnehin die Übersicht aller offenen Dienste bekommt (dienste-erinnerung.ts), bekommt dieselben Lücken nicht noch einmal.
        const rolleninhaber = [...new Map(kandidaten.filter((k) => !(k.istAdmin && k.adminHinweise)).map((k) => [k.id, k])).values()];
        if (rolleninhaber.length === 0) continue;

        const eintragungToken = eintragungsTokenFuerRolle(rolle, {
          zeitnehmer: verein.zeitnehmerSelbstanmeldungToken,
          ordner: verein.ordnerSelbstanmeldungToken,
          dienste: verein.diensteSelbstanmeldungToken,
        });
        const inhalt = offeneDiensteBroadcastInhalt(verein.name, ROLLE_LABEL[rolle], termine, eintragungToken, rolle);
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
