import "server-only";
import { appUrl } from "./app-url";
import type { EmailInhalt } from "./email-layout";
import { ersteSchritteZeile } from "./willkommens-mail";

// Mail an den neuen Vereinsadmin, wenn der Systemadmin einen eingerichteten
// Verein übergibt (siehe lib/treuhand.ts).
export function uebergabeInhalt(vereinName: string, email: string): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Dein Verein ist eingerichtet und übergeben.",
    zeilen: [
      `${vereinName} wurde für dich vorbereitet. Ab jetzt bist du der Vereinsadmin.`,
      `Melde dich mit deiner E-Mail-Adresse (${email}) an. Du bekommst dort einen Login-Link per E-Mail zugeschickt.`,
      ersteSchritteZeile(),
      "Der Zugriff, mit dem der Verein eingerichtet wurde, ist beendet. Falls du später Hilfe brauchst, kannst du dem Support unter Einstellungen ausdrücklich und befristet Zugriff geben.",
    ],
    cta: { text: "Zum Admin-Bereich", url: `${appUrl()}/admin` },
    kleingedrucktes: `Infos zur Datenverarbeitung: ${appUrl()}/datenschutz`,
  };
}
