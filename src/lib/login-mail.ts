import "server-only";
import { emailAlsHtml, emailAlsText } from "./email-layout";

export function loginMailText(url: string) {
  return emailAlsText({
    ueberschrift: "Dein Login-Link für HandballerPate",
    zeilen: [
      "Der Link ist eine kurze Zeit gültig und nur einmal verwendbar.",
    ],
    cta: { text: "Jetzt einloggen", url },
    kleingedrucktes:
      "Falls du diese Mail nicht angefordert hast, kannst du sie einfach ignorieren.",
  });
}

export function loginMailHtml(url: string) {
  return emailAlsHtml({
    ueberschrift:
      "Klick auf den Button, um dich einzuloggen — der Link ist kurz gültig und nur einmal verwendbar.",
    zeilen: [
      `Funktioniert der Button nicht? Kopiere diesen Link in deinen Browser: ${url}`,
    ],
    cta: { text: "Jetzt einloggen", url },
    kleingedrucktes:
      "Falls du diesen Login nicht angefordert hast, kannst du diese Mail ignorieren.",
  });
}
