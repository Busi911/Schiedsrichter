import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { abmeldeInfo } from "@/lib/abmelden";
import { appUrl } from "@/lib/app-url";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { sendMail } from "@/lib/mailer";

// Mails zum Online-Beitritt. An die Vereinsadmins nur Name und E-Mail (die übrigen Angaben stehen in der App, Datensparsamkeit);
// der Antragsteller bekommt Bestätigung, Annahme und Absage (zu seinem eigenen Antrag, nicht abbestellbar).

export function adminInhalt(vereinName: string, antragsteller: { vorname: string; name: string; email: string }, mannschaftName: string | null): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `Neuer Beitrittsantrag: ${antragsteller.vorname} ${antragsteller.name}`,
    zeilen: [
      "Über das Online-Formular ist ein Beitrittsantrag eingegangen.",
      `E-Mail: ${antragsteller.email}`,
      ...(mannschaftName ? [`Gewünschte Mannschaft: ${mannschaftName}`] : []),
      "Du kannst den Antrag unter „Verein → Mitglieder“ annehmen oder ablehnen.",
    ],
    cta: { text: "Antrag prüfen", url: `${appUrl()}/admin/mitglieder#antraege` },
  };
}

export function eingangInhalt(vereinName: string, vorname: string): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Dein Beitrittsantrag ist eingegangen",
    zeilen: [`Hallo ${vorname},`, `vielen Dank für dein Interesse am ${vereinName}. Dein Antrag ist angekommen, der Verein prüft ihn und meldet sich bei dir.`],
    kleingedrucktes: "Du hast diese Mail bekommen, weil für diese Adresse ein Beitrittsantrag gestellt wurde. Wenn du das nicht warst, kannst du sie ignorieren.",
  };
}

export function angenommenInhalt(vereinName: string, vorname: string): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `Willkommen beim ${vereinName}`,
    zeilen: [`Hallo ${vorname},`, `dein Beitrittsantrag wurde angenommen. Schön, dass du dabei bist! Der Verein meldet sich bei dir mit allem Weiteren.`],
  };
}

export function abgelehntInhalt(vereinName: string, vorname: string, grund: string | null): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Zu deinem Beitrittsantrag",
    zeilen: [
      `Hallo ${vorname},`,
      `leider können wir deinen Beitrittsantrag beim ${vereinName} im Moment nicht annehmen.`,
      ...(grund ? [`Hinweis des Vereins: ${grund}`] : []),
      "Bei Fragen melde dich gern direkt beim Verein.",
    ],
  };
}

async function sende(an: string, betreff: string, inhalt: EmailInhalt, abmeldeUrl?: string) {
  try {
    await sendMail(an, betreff, emailAlsText(inhalt), emailAlsHtml(inhalt), abmeldeUrl ? { abmeldeUrl } : {});
  } catch (err) {
    console.error("Beitritts-Mail fehlgeschlagen:", err);
  }
}

/** Mail an die Admins des Vereins: die mit eingeschalteten Admin-Hinweisen; hat keiner sie an (ältere Daten), alle vollen Admins, damit kein Antrag ungesehen bleibt. */
export async function sendeAntragAnAdmins(vereinId: string, vereinName: string, antragsteller: { vorname: string; name: string; email: string }, mannschaftName: string | null) {
  const admins = await adminDb.select({ id: users.id, email: users.email, hinweise: users.adminHinweiseAktiviert }).from(users).where(and(eq(users.vereinId, vereinId), eq(users.istAdmin, true)));
  const mitHinweisen = admins.filter((a) => a.hinweise);
  const empfaenger = mitHinweisen.length > 0 ? mitHinweisen : admins;
  const inhalt = adminInhalt(vereinName, antragsteller, mannschaftName);
  for (const admin of empfaenger) {
    const mitAbmeldung = { ...inhalt, abmelden: abmeldeInfo(admin.id, "admin-hinweise") };
    await sende(admin.email, `Neuer Beitrittsantrag: ${antragsteller.vorname} ${antragsteller.name}`, mitAbmeldung, mitAbmeldung.abmelden.url);
  }
}

export const sendeEingangsbestaetigung = (an: string, vereinName: string, vorname: string) => sende(an, `Dein Beitrittsantrag beim ${vereinName}`, eingangInhalt(vereinName, vorname));
export const sendeAnnahme = (an: string, vereinName: string, vorname: string) => sende(an, `Willkommen beim ${vereinName}`, angenommenInhalt(vereinName, vorname));
export const sendeAbsage = (an: string, vereinName: string, vorname: string, grund: string | null) => sende(an, `Dein Beitrittsantrag beim ${vereinName}`, abgelehntInhalt(vereinName, vorname, grund));
