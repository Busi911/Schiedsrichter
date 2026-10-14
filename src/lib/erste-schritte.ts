// "Erste Schritte"-Checkliste auf der Admin-Übersicht (/admin): zeigt einem neuen Verein, was noch fehlt, mit Link zur
// passenden Einstellung und zum Abschnitt der Hilfe. Rein (ohne DB), testbar; die Zahlen holt lib/erste-schritte-daten.ts.

export type ErsteSchritteStand = {
  spielplanAngebunden: boolean; // nuLiga- oder handball.net-Vereins-ID hinterlegt (liga_verein)
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
      text: "nuLiga- und/oder handball.net-Vereins-ID eintragen. Danach kommen Spiele, Verlegungen und Ergebnisse automatisch.",
      erledigt: s.spielplanAngebunden,
      href: "/admin/einstellungen#oeffentliche-seite",
      hilfeAnker: "oeffentliche-seite",
    },
    {
      schluessel: "mannschaften",
      titel: "Mannschaften prüfen",
      text: "Mit angebundenem Spielplan werden sie meist automatisch angelegt, sonst hier anlegen.",
      erledigt: s.mannschaften > 0,
      href: "/admin/mannschaften",
      hilfeAnker: "erste-schritte",
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
