// "Erste Schritte"-Checkliste auf der Admin-Übersicht (/admin): zeigt einem neuen Verein, was noch fehlt, mit Link zur
// passenden Einstellung und zum Abschnitt der Hilfe. Rein (ohne DB), testbar; die Zahlen holt lib/erste-schritte-daten.ts.

export type ErsteSchritteStand = {
  spielplanAngebunden: boolean; // nuLiga- oder handball.net-Vereins-ID hinterlegt (liga_verein)
  spielhallen: boolean; // "Eure Spielhallen" (oder eine alte Hallen-ID) gesetzt — ohne sie wird kein Heimspiel angelegt
  mannschaften: number;
  funktionstraegerMitRolle: number; // Personen mit mindestens einer aktiven Funktionsträger-Rolle
  einteilungen: number; // eingetragene Dienste (termin_zuordnung), egal ob zugeordnet oder selbst eingetragen
};

export type ErsterSchritt = {
  schluessel: string;
  titel: string;
  text: string;
  erledigt: boolean;
  /**
   * Gehört nur zu einem der Wege (automatischer Spielplan-Abgleich), nicht zur Grundeinrichtung: zählt nicht für „X von Y erledigt“ und hält
   * die Karte nicht offen. Ein Verein, der alles von Hand anlegt, soll nicht dauerhaft bei „1 von 5“ hängen.
   */
  optional: boolean;
  href: string;
  hilfeAnker: string;
};

export function ersteSchritte(s: ErsteSchritteStand): ErsterSchritt[] {
  return [
    {
      schluessel: "spielplan",
      titel: "Spielplan anbinden",
      text: "Optional: nuLiga- und/oder handball.net-Vereins-ID eintragen — der Assistent holt Mannschaften, Hallen, Logo und Spiele automatisch, danach kommen Verlegungen und Ergebnisse von selbst. Ohne Anbindung legt ihr Mannschaften und Termine (Freundschaftsspiele, Turniere) von Hand an.",
      erledigt: s.spielplanAngebunden,
      optional: true,
      href: "/admin/einrichtung",
      hilfeAnker: "oeffentliche-seite",
    },
    {
      schluessel: "spielhallen",
      titel: "Eure Spielhallen eintragen",
      text: s.spielplanAngebunden
        ? "Nur Spiele in diesen Hallen werden aus dem Spielplan als Heimspiel mit Diensten angelegt. Ohne Eintrag kommen keine Heimspiele automatisch."
        : "Nur für den automatischen Spielplan-Abgleich: Heimspiele in diesen Hallen werden als Termine angelegt. Von Hand angelegte Termine brauchen das nicht.",
      erledigt: s.spielhallen,
      // Ohne angebundenen Spielplan gibt es nichts abzugleichen; mit Anbindung ist es Pflicht (sonst kommen keine Heimspiele).
      optional: !s.spielplanAngebunden,
      href: "/admin/einstellungen#spielhallen",
      hilfeAnker: "spielhallen",
    },
    {
      schluessel: "mannschaften",
      titel: "Mannschaften prüfen",
      text: "Mit angebundenem Spielplan werden sie meist automatisch angelegt, sonst legt ihr sie hier von Hand an.",
      erledigt: s.mannschaften > 0,
      optional: false,
      href: "/admin/mannschaften",
      hilfeAnker: "mannschaften",
    },
    {
      schluessel: "funktionstraeger",
      titel: "Funktionsträger anlegen",
      text: "Schiedsrichter, Zeitnehmer/Sekretär, Ordner, Trainer … einzeln oder per Excel-Import, mit Rolle.",
      erledigt: s.funktionstraegerMitRolle > 0,
      optional: false,
      href: "/admin/funktionstraeger",
      hilfeAnker: "rollen",
    },
    {
      schluessel: "einteilung",
      titel: "Erste Dienste verteilen",
      text: "Dienste-Bedarf festlegen und Personen den Spielen zuordnen oder die Selbsteintragung freischalten.",
      erledigt: s.einteilungen > 0,
      optional: false,
      href: "/admin/kalender",
      hilfeAnker: "zuordnung",
    },
  ];
}

// Die Karte verschwindet, sobald alles Nötige erledigt ist (optionale Schritte halten sie nicht offen).
export function ersteSchritteOffen(schritte: ErsterSchritt[]): boolean {
  return schritte.some((s) => !s.erledigt && !s.optional);
}

/** „X von Y erledigt“: zählt nur die Schritte, die zur Grundeinrichtung gehören. */
export function ersteSchritteZaehlung(schritte: ErsterSchritt[]): { erledigt: number; gesamt: number } {
  const noetig = schritte.filter((s) => !s.optional);
  return { erledigt: noetig.filter((s) => s.erledigt).length, gesamt: noetig.length };
}
