import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users, vereine } from "@/db/schema";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { appUrl } from "./app-url";
import { formatDatum } from "./format";
import { istDauerhaft } from "./treuhand";

function vereinRegistriertInhalt(
  vereinName: string,
  adminName: string,
  adminEmail: string
): EmailInhalt {
  return {
    ueberschrift: `Neuer Verein registriert: ${vereinName}.`,
    zeilen: [`Admin: ${adminName} (${adminEmail})`],
    cta: { text: "Zu den Vereinen", url: `${appUrl()}/system/vereine` },
  };
}

// Best effort an ALLE Systemadmins: ein Mail-Fehler darf die auslösende
// Aktion nie verhindern.
async function mailAnSystemAdmins(betreff: string, inhalt: EmailInhalt) {
  const systemAdmins = await adminDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.istSystemAdmin, true));
  for (const admin of systemAdmins) {
    try {
      await sendMail(admin.email, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt));
    } catch (err) {
      console.error("Systemadmin-Benachrichtigung fehlgeschlagen:", err);
    }
  }
}

// Informiert ALLE Systemadmins per Mail, wenn sich ein Verein selbst
// registriert (siehe vereinRegistrieren in app/registrieren/actions.ts)
// oder aus der Warteliste heraus freigeschaltet wird (siehe
// wartelisteFreischalten in app/system/warteliste/actions.ts) — bewusst
// NICHT bei vereinErstellen (dort legt der Systemadmin den Verein selbst
// manuell an, eine Benachrichtigung darüber wäre redundant).
export async function benachrichtigeSystemAdminsUeberRegistrierung(
  vereinName: string,
  adminName: string,
  adminEmail: string
) {
  await mailAnSystemAdmins(
    `Neuer Verein registriert: ${vereinName}`,
    vereinRegistriertInhalt(vereinName, adminName, adminEmail)
  );
}

// Der Vereinsadmin hat dem Support befristet Zugriff erteilt (Einstellungen →
// Support-Zugriff). Nur bei einer Freigabe, nicht beim Widerruf.
export async function benachrichtigeSystemAdminsUeberSupportFreigabe(
  vereinId: string,
  bis: Date,
  akteur: string
) {
  const [v] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  const vereinName = v?.name ?? "Ein Verein";
  await mailAnSystemAdmins(`Support-Freigabe: ${vereinName}`, {
    ueberschrift: `${vereinName} hat dem Support Zugriff freigegeben.`,
    zeilen: [
      `Freigegeben von: ${akteur}`,
      (istDauerhaft(bis) ? "Der Zugriff gilt dauerhaft (bis zum Widerruf) und kann vom Verein jederzeit widerrufen werden." : `Der Zugriff gilt bis ${formatDatum(bis)} und kann vom Verein jederzeit widerrufen werden.`),
    ],
    cta: { text: "Zu den Vereinen", url: `${appUrl()}/system/vereine` },
  });
}

// Ein Verein möchte gesperrte Stammdaten ändern (Vereins-/Hallen-ID bei eingetragenen Diensten): Prüfung unter
// /system/aenderungen.
export async function benachrichtigeSystemAdminsUeberStammdatenAntrag(
  vereinName: string,
  feldLabel: string,
  bisher: string,
  neu: string,
  grund: string,
  akteur: string
) {
  await mailAnSystemAdmins(`Änderungsantrag: ${vereinName}`, {
    ueberschrift: `${vereinName} möchte „${feldLabel}“ ändern.`,
    zeilen: [`Bisher: ${bisher || "—"}`, `Neu: ${neu || "—"}`, `Grund: ${grund}`, `Beantragt von: ${akteur}`],
    cta: { text: "Antrag prüfen", url: `${appUrl()}/system/aenderungen` },
  });
}

// Feedback über den Button im Header (lib/feedback.ts): Text, Absender und Seite direkt in der Mail, damit der Systemadmin
// ohne Umweg über /system/feedback antworten kann (per Mail an die angegebene Adresse).
export async function benachrichtigeSystemAdminsUeberFeedback(
  vereinId: string,
  absender: { name: string | null; email: string | null },
  seite: string,
  nachricht: string
) {
  const [v] = await adminDb.select({ name: vereine.name }).from(vereine).where(eq(vereine.id, vereinId));
  const vereinName = v?.name ?? "Ein Verein";
  const wer = [absender.name, absender.email ? `<${absender.email}>` : null].filter(Boolean).join(" ") || "unbekannt";
  await mailAnSystemAdmins(`Feedback: ${vereinName}`, {
    ueberschrift: `Neues Feedback von ${vereinName}`,
    zeilen: [
      { text: nachricht, stark: true },
      { text: `Von: ${wer}`, neueGruppe: true },
      `Seite: ${seite}`,
    ],
    cta: { text: "Alle Rückmeldungen", url: `${appUrl()}/system/feedback` },
  });
}
