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
  href: string;
  hilfeAnker: string;
};

export function ersteSchritte(s: ErsteSchritteStand): ErsterSchritt[] {
  return [
    {
      schluessel: "spielplan",
      titel: "Spielplan anbinden",
      text: "nuLiga- und/oder handball.net-Vereins-ID eintragen — der Assistent holt Mannschaften, Hallen, Logo und Spiele automatisch. Danach kommen Verlegungen und Ergebnisse von selbst.",
      erledigt: s.spielplanAngebunden,
      href: "/admin/einrichtung",
      hilfeAnker: "oeffentliche-seite",
    },
    {
      schluessel: "spielhallen",
      titel: "Eure Spielhallen eintragen",
      text: "Nur Spiele in diesen Hallen werden als Heimspiel mit Diensten angelegt. Ohne Eintrag gibt es nichts einzuteilen.",
      erledigt: s.spielhallen,
      href: "/admin/einstellungen#spielhallen",
      hilfeAnker: "spielhallen",
    },
    {
      schluessel: "mannschaften",
      titel: "Mannschaften prüfen",
      text: "Mit angebundenem Spielplan werden sie meist automatisch angelegt, sonst hier anlegen.",
      erledigt: s.mannschaften > 0,
      href: "/admin/mannschaften",
      hilfeAnker: "mannschaften",
    },
    {
      schluessel: "funktionstraeger",
      titel: "Funktionsträger anlegen",
      text: "Schiedsrichter, Zeitnehmer/Sekretär, Ordner, Trainer … einzeln oder per Excel-Import, mit Rolle.",
      erledigt: s.funktionstraegerMitRolle > 0,
      href: "/admin/funktionstraeger",
      hilfeAnker: "rollen",
    },
    {
      schluessel: "einteilung",
      titel: "Erste Dienste verteilen",
      text: "Dienste-Bedarf festlegen und Personen den Spielen zuordnen oder die Selbsteintragung freischalten.",
      erledigt: s.einteilungen > 0,
      href: "/admin/kalender",
      hilfeAnker: "zuordnung",
    },
  ];
}

// Die Karte verschwindet, sobald alles erledigt ist.
export function ersteSchritteOffen(schritte: ErsterSchritt[]): boolean {
  return schritte.some((s) => !s.erledigt);
}
