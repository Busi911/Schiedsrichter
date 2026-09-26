import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { appUrl } from "./app-url";

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

// Informiert ALLE Systemadmins per Mail, wenn sich ein Verein selbst
// registriert (siehe vereinRegistrieren in app/registrieren/actions.ts)
// oder aus der Warteliste heraus freigeschaltet wird (siehe
// wartelisteFreischalten in app/system/warteliste/actions.ts) — bewusst
// NICHT bei vereinErstellen (dort legt der Systemadmin den Verein selbst
// manuell an, eine Benachrichtigung darüber wäre redundant). Best effort:
// ein Mail-Fehler hier darf die Registrierung selbst nicht verhindern.
export async function benachrichtigeSystemAdminsUeberRegistrierung(
  vereinName: string,
  adminName: string,
  adminEmail: string
) {
  const systemAdmins = await adminDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.istSystemAdmin, true));
  if (systemAdmins.length === 0) return;

  const inhalt = vereinRegistriertInhalt(vereinName, adminName, adminEmail);
  for (const admin of systemAdmins) {
    try {
      await sendMail(
        admin.email,
        `Neuer Verein registriert: ${vereinName}`,
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Systemadmin-Benachrichtigung fehlgeschlagen:", err);
    }
  }
}
