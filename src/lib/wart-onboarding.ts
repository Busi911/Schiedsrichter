// Onboarding für die Wart-Seiten (Schiedsrichter-, Zeitnehmer-, Ordner-, Dienstwart): eine kurze Karte "So legst du los" ganz oben, mit
// wenigen Schritten, deren Haken aus den Daten kommen (nichts von Hand abhaken). Verschwindet von selbst, sobald alle prüfbaren Schritte
// erledigt sind, oder per "Ausblenden" (Cookie, nur dieses Gerät). Rein (ohne DB), getestet in wart-onboarding.test.ts.

// Cookie "ausgeblendet" (kommagetrennte Rollen), nur auf /profil und nur dieses Gerät.
export const WART_ONBOARDING_COOKIE = "hp_wart_onboarding";

export type WartRolle = "schiedsrichter" | "zeitnehmer" | "ordner" | "dienst";
export const WART_ROLLEN: readonly WartRolle[] = ["schiedsrichter", "zeitnehmer", "ordner", "dienst"];

export type WartStand = {
  // Personen, die der Wart einteilen kann (Schiedsrichter, Zeitnehmer/Sekretär, Ordner/Kiosk/Kassierer) bzw. Zahl der eigenen Dienste
  personen: number;
  // Login-freier Eintragungslink aktiv (nur Zeitnehmer-, Ordner-, Dienstwart)
  linkAktiv: boolean;
  // Einteilungen dieser Rolle (irgendein Termin)
  einteilungen: number;
  // Admin: darf zu den Einstellungen/Funktionsträgern verlinken; ein Wart ohne Admin-Rechte kommt dort nicht hin
  istAdmin: boolean;
};

export type WartSchritt = {
  schluessel: string;
  titel: string;
  text: string;
  // null = Tipp ohne Haken (zählt nicht für "alles erledigt")
  erledigt: boolean | null;
  href?: string;
  hilfeAnker: string;
};

const TITEL: Record<WartRolle, string> = {
  schiedsrichter: "Schiedsrichterwart",
  zeitnehmer: "Zeitnehmerwart",
  ordner: "Ordnerwart",
  dienst: "Dienstwart",
};
export const wartTitel = (rolle: WartRolle) => TITEL[rolle];

export function wartSchritte(rolle: WartRolle, s: WartStand): WartSchritt[] {
  const einteilen: WartSchritt = {
    schluessel: "einteilen",
    titel: "Ersten Termin besetzen",
    text: "Unten bei „Termine“ einen Termin aufklappen, Person wählen, einteilen. Sie bekommt automatisch eine Mail.",
    erledigt: s.einteilungen > 0,
    href: "#termine",
    hilfeAnker: "zuordnung",
  };
  const link = (wer: string): WartSchritt => ({
    schluessel: "link",
    titel: "Eintragungslink teilen",
    text: `Aktiviere oben den Link und schick ihn in die Gruppe: ${wer} tragen sich dann selbst ein, du musst nicht alles einteilen.`,
    erledigt: s.linkAktiv,
    href: "#selbsteintragung",
    hilfeAnker: "selbsteintragung",
  });
  switch (rolle) {
    case "schiedsrichter":
      return [
        {
          schluessel: "personen",
          titel: "Schiedsrichter im Verein",
          text: "Oben siehst du alle Schiedsrichter mit ihren Einsätzen. Fehlt jemand? Der Vereinsadmin legt ihn unter Funktionsträger an.",
          erledigt: s.personen > 0,
          href: s.istAdmin ? "/admin/funktionstraeger" : undefined,
          hilfeAnker: "funktionstraeger",
        },
        { ...einteilen, text: "Nur bei Spielen, bei denen der Verein den Schiedsrichter stellt (z.B. Freundschaftsspiele): Termin aufklappen, Schiedsrichter wählen." },
        {
          schluessel: "tipp",
          titel: "Tipp: Ersetzen statt Löschen",
          text: "Fällt jemand aus, kannst du ihn beim Termin direkt ersetzen. Die Person wird informiert.",
          erledigt: null,
          hilfeAnker: "warte",
        },
      ];
    case "zeitnehmer":
    case "ordner": {
      const name = rolle === "zeitnehmer" ? "Zeitnehmer/Sekretär" : "Ordner, Kioskdienst und Kassierer";
      return [
        {
          schluessel: "personen",
          titel: `${name} anlegen`,
          text: "Wer soll eingeteilt werden können? Der Vereinsadmin legt die Personen unter Funktionsträger an (einzeln oder per Excel).",
          erledigt: s.personen > 0,
          href: s.istAdmin ? "/admin/funktionstraeger" : undefined,
          hilfeAnker: "funktionstraeger",
        },
        link(rolle === "zeitnehmer" ? "Zeitnehmer, Sekretäre und Eltern" : "Helfer und Eltern"),
        einteilen,
        {
          schluessel: "tipp",
          titel: "Tipp: Bedarf anpassen und Abmeldungen",
          text: "Je Termin lässt sich der Bedarf anpassen (auch auf 0). Meldet sich jemand ab, bestätigst oder lehnst du es hier ab.",
          erledigt: null,
          hilfeAnker: "bedarf",
        },
      ];
    }
    case "dienst":
      return [
        {
          schluessel: "personen",
          titel: "Eigenen Dienst anlegen",
          text: "Z.B. Fahrer, Kuchen oder Aufbau. Der Vereinsadmin legt ihn unter Einstellungen → Dienste an; dort steht auch, für welche Spiele er gilt.",
          erledigt: s.personen > 0,
          href: s.istAdmin ? "/admin/einstellungen#eigene-dienste" : undefined,
          hilfeAnker: "eigene-dienste",
        },
        link("Eltern"),
        einteilen,
        {
          schluessel: "tipp",
          titel: "Tipp: Fahrgemeinschaft",
          text: "Beim Dienst „Fahrer“ gibt es das Häkchen „Fahrgemeinschaft“: Fahrer nennen freie Plätze, Mitfahrer tragen sich selbst ein.",
          erledigt: null,
          hilfeAnker: "fahrgemeinschaft",
        },
      ];
  }
}

// Die Karte zeigt sich, solange mindestens ein prüfbarer Schritt offen ist.
export function wartOnboardingOffen(schritte: WartSchritt[]): boolean {
  return schritte.some((s) => s.erledigt === false);
}
