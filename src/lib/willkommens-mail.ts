import "server-only";
import { appUrl } from "./app-url";
import type { EmailInhalt } from "./email-layout";
import { rollenHinweise } from "./rollen-hinweise";

// Für jede Person, für die neu ein Zugang angelegt wird (Admin legt einen
// Funktionsträger/eine Mannschaft mit Trainer an, Wart bestätigt eine
// Selbsteintragung mit "Neue Person anlegen", ...) — bislang in
// admin/actions.ts und profil/zeitnehmerwart/actions.ts identisch dupliziert,
// weil eine "use server"-Datei nur async-Funktionen exportieren darf. Diese
// Datei hat kein "use server", die Aufrufer bleiben schlanke Wrapper.
export function willkommensInhalt(
  vereinName: string,
  email: string,
  einmalPasswort: string | null,
  // Rollen der Person (Typen aus funktionstraeger_rolle): bei Wart-Rollen/Trainer kommt eine kurze Starthilfe dazu (lib/rollen-hinweise.ts).
  rollenTypen: string[] = []
): EmailInhalt {
  const hinweise = rollenHinweise(rollenTypen, appUrl());
  return {
    vereinName,
    ueberschrift: "Für dich wurde ein Zugang angelegt.",
    zeilen: [
      ...(einmalPasswort
      ? [
          `Melde dich mit deiner E-Mail-Adresse (${email}) und dem folgenden Einmal-Passwort an.`,
          `Einmal-Passwort: ${einmalPasswort}`,
          "Direkt nach dem ersten Login musst du ein eigenes Passwort vergeben. Alternativ kannst du dich jederzeit auch ohne Passwort per Login-Link einloggen.",
        ]
      : [
          `Melde dich mit deiner E-Mail-Adresse (${email}) an — du bekommst dort einen Login-Link per E-Mail zugeschickt.`,
        ]),
      ...hinweise.zeilen,
    ],
    cta: hinweise.cta ?? { text: "Jetzt einloggen", url: `${appUrl()}/login` },
    kleingedrucktes: `Infos zur Datenverarbeitung: ${appUrl()}/datenschutz`,
  };
}

// Anleitung für neue Vereinsadmins (Abschnitt "Erste Schritte" in /hilfe, nur eingeloggt erreichbar).
export function ersteSchritteUrl(): string {
  return `${appUrl()}/hilfe#erste-schritte`;
}

export function ersteSchritteZeile(): string {
  return `So geht's los: Die Anleitung „Erste Schritte“ führt in wenigen Schritten durch die Einrichtung (nach dem Login): ${ersteSchritteUrl()}. Auf der Übersicht im Admin-Bereich seht ihr außerdem, welche Schritte noch offen sind.`;
}

// Für einen neuen Vereinsadmin (Selbstregistrierung, Freischaltung von der Warteliste): wie willkommensInhalt,
// zusätzlich mit dem Hinweis auf die Erste-Schritte-Anleitung. Funktionsträger bekommen den Hinweis nicht.
export function adminWillkommensInhalt(vereinName: string, email: string): EmailInhalt {
  const basis = willkommensInhalt(vereinName, email, null);
  return {
    ...basis,
    ueberschrift: "Willkommen bei HandballerPate! Dein Verein ist angelegt.",
    zeilen: [...basis.zeilen, ersteSchritteZeile()],
    cta: { text: "Zum Admin-Bereich", url: `${appUrl()}/admin` },
  };
}

// Einmalige Mail an die Admins bereits aktiver Vereine (ausgelöst vom Systemadmin unter /system/mail):
// Hinweis auf die Anleitung und die neue Erste-Schritte-Übersicht.
export function ersteSchritteInhalt(vereinName: string): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Neu: Anleitung „Erste Schritte“ für euren Verein",
    zeilen: [
      "Damit ihr HandballerPate schnell vollständig nutzen könnt, gibt es jetzt eine kurze Anleitung „Erste Schritte“: Spielplan anbinden, eure Spielhallen eintragen, Mannschaften und Funktionsträger anlegen, Dienste-Bedarf festlegen und Aufgaben verteilen.",
      `Anleitung (nach dem Login): ${ersteSchritteUrl()}`,
      "Auf der Übersicht im Admin-Bereich zeigt euch eine Checkliste, welche Schritte bei euch noch offen sind. Sie verschwindet, sobald alles eingerichtet ist.",
      "Fragen oder Wünsche? Schreibt uns einfach über den Feedback-Button oben in der App.",
    ],
    cta: { text: "Zum Admin-Bereich", url: `${appUrl()}/admin` },
    kleingedrucktes: "Diese Mail geht einmalig an die Admins aller aktiven Vereine.",
  };
}
