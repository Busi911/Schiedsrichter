// Inhalt der öffentlichen Roadmap (/roadmap). EINE Quelle: bei jeder fertigen, begonnenen oder verschobenen Funktion hier den
// Status anpassen und `ROADMAP_STAND` auf das heutige Datum setzen (siehe CLAUDE.md "Roadmap immer mitziehen").
// Nur Wahres als "fertig" eintragen (was im Produkt läuft); alles andere ehrlich als geplant oder Idee. Keine Zusagen für Termine,
// die nicht gehalten werden können: Ideen haben bewusst KEIN Datum.

export const ROADMAP_STAND = "2026-10-18";

export type RoadmapStatus = "fertig" | "in_arbeit" | "geplant" | "idee";

export type RoadmapPunkt = {
  titel: string;
  status: RoadmapStatus;
  text?: string;
};

export type RoadmapPhase = {
  id: string;
  titel: string;
  zeitraum: string;
  ziel: string;
  punkte: RoadmapPunkt[];
};

export const STATUS_LABEL: Record<RoadmapStatus, string> = {
  fertig: "Fertig",
  in_arbeit: "In Arbeit",
  geplant: "Geplant",
  idee: "Idee",
};

export const ROADMAP: RoadmapPhase[] = [
  {
    id: "stabil",
    titel: "Stabil in die Zeit nach der Beta",
    zeitraum: "bis 30.11.2026",
    ziel: "Eine verlässlich laufende öffentliche App mit aktuellen Spielen und Ergebnissen, und eine vollständige Verwaltung von Funktionsträgern und Vereinsterminen.",
    punkte: [
      {
        titel: "Öffentliche Vereins-App",
        status: "fertig",
        text: "Ergebnisse, nächste Spiele, Mannschaften, Tabellen, Statistik und Training je Verein, ohne Anmeldung, als installierbare App mit Favoriten und eigener Vereinsfarbe.",
      },
      {
        titel: "Spiele und Ergebnisse aus nuLiga, handball.net und NDR",
        status: "fertig",
        text: "Spielpläne, Ergebnisse und Tabellen aus den Quellen der Verbände, stündlich aktualisiert; handball.net hat seit 18.10.2026 einen eigenen Abruf.",
      },
      {
        titel: "Ergebnisse zuverlässig und zeitnah",
        status: "in_arbeit",
        text: "Gespielte Spiele ohne Ergebnis werden bevorzugt nachgeladen, Zwischenstände werden nie als Endstand gezeigt. Wir beobachten die Läufe im Spielbetrieb und beheben, was auffällt.",
      },
      {
        titel: "Überwachung der Synchronisation",
        status: "geplant",
        text: "Automatischer Hinweis an uns, wenn ein Abruf ausfällt oder ein Verein zu lange keine neuen Daten bekommt.",
      },
      {
        titel: "Funktionsträger und Dienste",
        status: "in_arbeit",
        text: "Rollen, Excel-Import, Schiedsrichter-, Zeitnehmer-, Ordner- und Dienstwart, eigene Dienste, Selbsteintragung und Abmeldung sind im Einsatz. Bis Ende November prüfen wir alles gemeinsam mit Pilotvereinen und schließen Lücken.",
      },
      {
        titel: "Vereinstermine mit Zu- und Absage",
        status: "in_arbeit",
        text: "Sitzungen und Termine mit Sichtbarkeit, Zu-/Absage, Erinnerungen und Wiederholungen sind fertig. Bis Ende November: Abnahme im Alltag der Pilotvereine.",
      },
      {
        titel: "Abnahme mit Pilotvereinen",
        status: "geplant",
        text: "Gemeinsamer Durchgang aller Funktionen mit Vereinen, die die App im Spielbetrieb nutzen; offene Punkte kommen in diese Roadmap.",
      },
    ],
  },
  {
    id: "oeffentliche-app",
    titel: "Öffentliche App weiterentwickeln",
    zeitraum: "ab Dezember 2026",
    ziel: "Mehr Nutzen für Spieler, Eltern und Fans, ohne die Verlässlichkeit zu gefährden.",
    punkte: [
      {
        titel: "Benachrichtigungen zu Favoriten",
        status: "idee",
        text: "Hinweis aufs Handy, wenn ein Ergebnis da ist oder sich eine Anwurfzeit ändert.",
      },
      {
        titel: "Tabellenverlauf und Staffelspiele",
        status: "idee",
        text: "Platz je Spieltag und alle Spiele einer Staffel, nicht nur die der eigenen Mannschaften.",
      },
      {
        titel: "Live-Ticker in der App",
        status: "idee",
        text: "Heute verlinken wir auf die Ticker der Verbände. Eine eigene Ansicht hängt an der Freigabe der Datenquelle.",
      },
      {
        titel: "Weitere Landesverbände",
        status: "idee",
        text: "Nach Absprache mit den jeweiligen Verbänden.",
      },
    ],
  },
  {
    id: "vereinsverwaltung",
    titel: "Vereinsverwaltung",
    zeitraum: "noch nicht terminiert",
    ziel: "Aus der App für Spielbetrieb und Ehrenamt soll mit der Zeit eine Verwaltung für den ganzen Handballverein werden. Reihenfolge und Umfang entscheiden wir mit den Vereinen, nichts davon ist zugesagt.",
    punkte: [
      {
        titel: "Mitgliederverwaltung",
        status: "idee",
        text: "Stammdaten, Eintritt und Austritt, Zuordnung zu Mannschaften, Online-Beitrittsformular mit Einwilligungen.",
      },
      {
        titel: "Beiträge",
        status: "idee",
        text: "Beitragsklassen, SEPA-Lastschrift mit Mandaten, Zahlungsübersicht und Erinnerungen.",
      },
      {
        titel: "Neuigkeiten und Mitteilungen",
        status: "idee",
        text: "Eine Neuigkeiten-Seite je Verein, Rundmails an Gruppen, Mitteilungen an Mannschaften.",
      },
      {
        titel: "Datenschutz im Verein",
        status: "idee",
        text: "Einwilligungen (auch für Minderjährige und Fotos), Auskunft und Löschfristen.",
      },
      {
        titel: "Spielbetrieb und Kader",
        status: "idee",
        text: "Kader je Mannschaft und Saison. Was mit Spielberechtigungen möglich ist, muss mit den Verbänden geklärt werden.",
      },
      {
        titel: "Sponsoren, Dokumente, Versammlungen",
        status: "idee",
        text: "Sponsorenübersicht, Ablage von Protokollen und Satzung, Einladung zur Mitgliederversammlung.",
      },
    ],
  },
];
