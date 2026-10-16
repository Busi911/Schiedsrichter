import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine } from "@/db/schema";
import { appUrl } from "./app-url";
import { abmeldeInfo } from "./abmelden";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatumZeitLang, formatZeit } from "./format";
import { sendMail } from "./mailer";
import { ARTEN, type Art } from "./vereinstermine";

export type TerminMailDaten = {
  vereinName: string;
  id: string;
  titel: string;
  art: string;
  start: Date;
  ende: Date | null;
  ort: string | null;
  beschreibung: string | null;
  antwortAbfrage: boolean;
  variante: "einladung" | "geaendert" | "abgesagt";
  geaendert?: string[]; // z.B. ["Beginn", "Ort"]
};

const artLabel = (art: string) => ARTEN[art as Art] ?? "Termin";

// Inhalt EINMAL beschrieben (siehe CLAUDE.md "E-Mail-Layout"); den Abmelde-Link ergänzt der Versand je Person.
export function vereinsterminInhalt(d: TerminMailDaten): EmailInhalt {
  const wann = `${formatDatumZeitLang(d.start)}${d.ende ? ` bis ${formatZeit(d.ende)} Uhr` : " Uhr"}`;
  const kopf = `${artLabel(d.art)}: ${d.titel}`;
  const details = [{ text: wann, stark: true }, ...(d.ort ? [`Ort: ${d.ort}`] : []), ...(d.beschreibung ? [d.beschreibung] : [])];
  const link = { text: d.antwortAbfrage ? "Zu- oder absagen" : "Termin ansehen", url: `${appUrl()}/profil/vereinstermine#termin-${d.id}` };
  const klein = "Du bekommst diese Mail, weil du zu diesem Termin eingeladen bist. Abschaltbar in deinen Benachrichtigungs-Einstellungen.";
  if (d.variante === "abgesagt") {
    return { vereinName: d.vereinName, ueberschrift: `Abgesagt: ${kopf}`, zeilen: [{ text: wann, stark: true }, "Dieser Termin findet nicht statt."], kleingedrucktes: klein };
  }
  if (d.variante === "geaendert") {
    return {
      vereinName: d.vereinName,
      ueberschrift: `Geändert: ${kopf}`,
      zeilen: [`Geändert wurde: ${(d.geaendert ?? []).join(", ") || "der Termin"}.`, ...details, ...(d.antwortAbfrage ? ["Bitte prüfe deine Zu- oder Absage."] : [])],
      cta: link,
      kleingedrucktes: klein,
    };
  }
  return {
    vereinName: d.vereinName,
    ueberschrift: `Einladung: ${kopf}`,
    zeilen: [...details, ...(d.antwortAbfrage ? ["Bitte gib kurz Bescheid, ob du kommen kannst."] : [])],
    cta: link,
    kleingedrucktes: klein,
  };
}

// Einladung/Änderung/Absage an die übergebenen Personen (nur die mit eingeschaltetem persönlichem Schalter). Best-effort, ein Fehler stoppt die anderen nicht.
export async function sendeVereinsterminMails(vereinId: string, personIds: string[], daten: Omit<TerminMailDaten, "vereinName">) {
  if (personIds.length === 0) return { versendet: 0 };
  const [verein] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  if (!verein) return { versendet: 0 };
  // "user" hat keine RLS: Vereinsfilter ist Pflicht.
  const empfaenger = await adminDb
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.vereinId, vereinId), inArray(users.id, personIds), eq(users.vereinsterminHinweiseAktiviert, true)));

  const inhalt = vereinsterminInhalt({ ...daten, vereinName: verein.name });
  const betreff = inhalt.ueberschrift;
  let versendet = 0;
  await Promise.all(
    empfaenger.map(async (p) => {
      try {
        const mitAbmeldung = { ...inhalt, abmelden: abmeldeInfo(p.id, "vereinstermin") };
        await sendMail(p.email, betreff, emailAlsText(mitAbmeldung), emailAlsHtml(mitAbmeldung), { abmeldeUrl: mitAbmeldung.abmelden.url });
        versendet++;
      } catch (err) {
        console.error("Vereinstermin-Mail fehlgeschlagen:", err);
      }
    })
  );
  return { versendet };
}
