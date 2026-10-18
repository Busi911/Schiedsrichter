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
        text: "Ergebnisse, nächste Spiele, Mannschaften mit Tabelle und Spielplan, Statistik und (wenn der Verein es einschaltet) Training, ohne Anmeldung. Installierbar aufs Handy, mit Favoriten, eigener Vereinsfarbe und Hell-/Dunkel-Ansicht.",
      },
      {
        titel: "Spiele und Ergebnisse aus nuLiga, handball.net und NDR",
        status: "fertig",
        text: "nuLiga (Hessischer Handball-Verband), handball.net (DHB: 3. Liga, Jugendbundesliga, Qualifikation) und NDR (1. und 2. Bundesliga). nuLiga und handball.net werden mindestens stündlich abgerufen, NDR alle 15 Minuten; nuLiga-Spiele lädt am Wochenende ein eigener Lauf rund um den Anwurf häufiger nach. handball.net hat seit 18.10.2026 einen eigenen Abruf.",
      },
      {
        titel: "Ergebnisse zuverlässig und zeitnah",
        status: "in_arbeit",
        text: "Gespielte Spiele ohne Ergebnis werden bevorzugt nachgeladen (seit 18.10.2026 auch nachgeholte, verlegte Spiele; bei verlegten Spielen steht der ursprüngliche Termin dabei), Zwischenstände werden nie als Endstand gezeigt. Wir prüfen die Abrufe im Spielbetrieb und beheben, was auffällt.",
      },
      {
        titel: "Überwachung der Synchronisation",
        status: "fertig",
        text: "Ein automatischer Prüflauf (fünfmal täglich) schaut nach, ob die Abrufe aus nuLiga, handball.net und NDR sowie die Übernahme in die Termine laufen, und meldet uns jeden Ausfall per Mail, damit wir eingreifen, bevor Vereine es merken. Der Stand steht außerdem für uns im Systembereich.",
      },
      {
        titel: "Funktionsträger und Dienste",
        status: "in_arbeit",
        text: "Rollen (u. a. Trainer, Schiedsrichter, Zeitnehmer/Sekretär, Ordner, Kioskdienst, Kassierer), Excel-Import, Wart-Seiten, eigene Dienste mit Fahrgemeinschaft, öffentliche Selbsteintragung und Abmeldung sind im Einsatz. Bis Ende November prüfen wir alles mit den Beta-Vereinen und schließen Lücken.",
      },
      {
        titel: "Vereinstermine mit Zu- und Absage",
        status: "in_arbeit",
        text: "Sitzungen und Termine mit Sichtbarkeit für Rollen oder Personen, Zu-/Absage, Wiederholungen, Mails bei Einladung, Änderung und Absage sowie Kalender-Abo sind fertig. Bis Ende November: Abnahme im Alltag der Beta-Vereine.",
      },
      {
        titel: "Erinnerung vor Vereinsterminen",
        status: "geplant",
        text: "Bisher gibt es Mails bei Einladung, Änderung und Absage, aber noch keine Erinnerung kurz vor dem Termin.",
      },
      {
        titel: "Training und Kalender",
        status: "fertig",
        text: "Trainingsplan mit Ausfällen und freien Hallenzeiten (wer zuerst bucht), Plätze mit Saison für Beachhandball, ein Gesamtkalender für Spiele, Training und Vereinstermine, persönliches Kalender-Abo und eine Wochenübersicht per Mail.",
      },
      {
        titel: "Einstieg für neue Vereine",
        status: "fertig",
        text: "Einrichtungs-Assistent mit automatischer Einrichtung über die Vereins-ID von nuLiga oder handball.net und eine Demo zum Ausprobieren.",
      },
      {
        titel: "Abnahme mit den Beta-Vereinen",
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
    ziel: "Aus der App für Spielbetrieb und Ehrenamt soll mit der Zeit eine Verwaltung für den ganzen Handballverein werden, aufgebaut auf den Spiel- und Mannschaftsdaten, die die App ohnehin lädt. Die Funktionsträger-Verwaltung und die App bleiben der Kern (300 € im Jahr); die Vereinsverwaltung ist ein optionales Add-on (200 € zusätzlich). Reihenfolge und Umfang entscheiden wir mit den Vereinen, ein Pilotverein begleitet die Entwicklung. Termine sind nicht zugesagt.",
    punkte: [
      {
        titel: "Mitgliederverwaltung",
        status: "in_arbeit",
        text: "Die Mitgliederliste steht (für Vereine mit freigeschaltetem Add-on): anlegen, bearbeiten, suchen, nach Status filtern, Austritt vermerken. Funktionsträger werden beim Freischalten automatisch als Mitglieder übernommen, mit Duplikatprüfung. Mitglieder lassen sich je Saison Mannschaften zuordnen (Spieler, Trainer, Betreuer) und haben eine vom Verein gepflegte Art der Mitgliedschaft (z.B. Fördermitglied). Mitglieder lassen sich als Excel-Datei importieren und exportieren. Interessierte können online die Mitgliedschaft beantragen (öffentliches Formular mit Einwilligungen); der Verein nimmt Anträge an oder lehnt sie ab. Als Nächstes kommen der Kader mit Saisonwechsel und Mitteilungen an Mannschaften; Beiträge folgen danach.",
      },
      {
        titel: "Beiträge",
        status: "idee",
        text: "Beitragsklassen, Beitragsliste und SEPA-Lastschrift mit Mandaten (als Datei für die Bank, ohne Zahlungsabwicklung). Kommt nach Kader und Mitteilungen.",
      },
      {
        titel: "Kader und Saisonwechsel",
        status: "geplant",
        text: "Kader je Mannschaft und Saison mit Vorschlägen aus Alter und Mannschaft und einem geführten Wechsel zur neuen Saison, damit niemand alle Personen neu zuordnen muss. Spielberechtigungen und Pässe bleiben bei den Verbänden (Handball360) und sind kein Teil davon.",
      },
      {
        titel: "Mitteilungen an Mannschaften und Eltern",
        status: "geplant",
        text: "Trainer und Verein schreiben Mannschaften, Gruppen und Eltern direkt aus der App, mit Rückmeldung per Klick (heute gibt es nur automatische Mails, z. B. zu offenen Diensten). Eine Neuigkeiten-Seite je Verein kann später dazukommen.",
      },
      {
        titel: "Datenschutz im Verein",
        status: "idee",
        text: "Einwilligungen (auch für Minderjährige und Fotos), Auskunft und Löschfristen.",
      },
      {
        titel: "Sponsor für einen Verein übernehmen",
        status: "fertig",
        text: "Wer als Sponsor einem Handballverein die App ermöglichen möchte, kann sich melden. Der Sponsor übernimmt den kompletten Vereinspreis (Basis, auf Wunsch mit Vereinsverwaltung) plus 200 € für den Sponsor-Platz, ein Bild beim Öffnen der Vereinsseite. Der Verein zahlt dann nichts. Kontakt: info@deweconsulting.de.",
      },
      {
        titel: "Sponsoren, Dokumente, Versammlungen",
        status: "idee",
        text: "Heute gibt es das Sponsorenbild auf der öffentlichen Seite. Eine Sponsorenübersicht, die Ablage von Protokollen und Satzung und die Einladung zur Mitgliederversammlung sind Ideen.",
      },
    ],
  },
];
