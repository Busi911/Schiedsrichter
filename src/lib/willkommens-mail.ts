import "server-only";
import { appUrl } from "./app-url";
import type { EmailInhalt } from "./email-layout";

// Für jede Person, für die neu ein Zugang angelegt wird (Admin legt einen
// Funktionsträger/eine Mannschaft mit Trainer an, Wart bestätigt eine
// Selbsteintragung mit "Neue Person anlegen", ...) — bislang in
// admin/actions.ts und profil/zeitnehmerwart/actions.ts identisch dupliziert,
// weil eine "use server"-Datei nur async-Funktionen exportieren darf. Diese
// Datei hat kein "use server", die Aufrufer bleiben schlanke Wrapper.
export function willkommensInhalt(
  vereinName: string,
  email: string,
  einmalPasswort: string | null
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Für dich wurde ein Zugang angelegt.",
    zeilen: einmalPasswort
      ? [
          `Melde dich mit deiner E-Mail-Adresse (${email}) und dem folgenden Einmal-Passwort an.`,
          `Einmal-Passwort: ${einmalPasswort}`,
          "Direkt nach dem ersten Login musst du ein eigenes Passwort vergeben. Alternativ kannst du dich jederzeit auch ohne Passwort per Login-Link einloggen.",
        ]
      : [
          `Melde dich mit deiner E-Mail-Adresse (${email}) an — du bekommst dort einen Login-Link per E-Mail zugeschickt.`,
        ],
    cta: { text: "Jetzt einloggen", url: `${appUrl()}/login` },
  };
}
