import type { Metadata } from "next";
import Link from "next/link";
import { ZurueckButton } from "@/components/zurueck-button";

export const metadata: Metadata = {
  title: "Roadmap – HandballerPate",
  description:
    "Woran wir arbeiten: stabile Vereins-App mit aktuellen Spielen und Ergebnissen, Funktionsträger- und Terminverwaltung, und was danach kommen könnte.",
};

const STAND = "18.10.2026";
const BETA_ENDE = "30.11.2026";

type Status = "fertig" | "in_arbeit" | "geplant" | "idee";

const STATUS_LABEL: Record<Status, string> = {
  fertig: "Fertig",
  in_arbeit: "In Arbeit",
  geplant: "Geplant",
  idee: "Idee",
};

const STATUS_CLASS: Record<Status, string> = {
  fertig:
    "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  in_arbeit:
    "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  geplant:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  idee: "bg-muted text-muted-foreground",
};

function Badge({ status }: { status: Status }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type Eintrag = {
  titel: string;
  status: Status;
  text: string;
};

function Karte({ eintrag }: { eintrag: Eintrag }) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{eintrag.titel}</h3>
        <Badge status={eintrag.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{eintrag.text}</p>
    </li>
  );
}

type Abschnitt = {
  id: string;
  titel: string;
  zeit: string;
  einleitung: string;
  eintraege: Eintrag[];
};

const abschnitte: Abschnitt[] = [
  {
    id: "stabil",
    titel: "Stabil in die Zeit nach der Beta",
    zeit: `bis ${BETA_ENDE}`,
    einleitung:
      "Eine verlässlich laufende öffentliche App mit aktuellen Spielen und Ergebnissen, und eine vollständige Verwaltung von Funktionsträgern und Vereinsterminen.",
    eintraege: [
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
        text: "Gespielte Spiele ohne Ergebnis werden bevorzugt nachgeladen, Zwischenstände werden nie als Endstand gezeigt. Wir prüfen die Abrufe im Spielbetrieb und beheben, was auffällt.",
      },
      {
        titel: "Überwachung der Synchronisation",
        status: "geplant",
        text: "Bisher sieht nur der Vereinsadmin das Protokoll des letzten Abrufs in den Einstellungen. Geplant ist ein automatischer Hinweis an uns, wenn ein Abruf ausfällt oder ein Verein zu lange keine neuen Daten bekommt.",
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
    zeit: "ab Dezember 2026",
    einleitung:
      "Mehr Nutzen für Spieler, Eltern und Fans, ohne die Verlässlichkeit zu gefährden.",
    eintraege: [
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
    titel: "Vereinsverwaltung (optionales Add-on)",
    zeit: "ab Januar 2027",
    einleitung:
      "Die Funktionsträger-Verwaltung und die App bleiben der Kern (300 € im Jahr). Wer darüber hinaus eine vollständige Vereinsverwaltung braucht — Mitgliederverwaltung, Online-Beitritt, Beitragsklassen und SEPA — schaltet das als optionales Add-on hinzu (200 € zusätzlich, also 500 € gesamt). Ein Sponsor übernimmt immer den kompletten Vereinspreis (Basis oder Basis + Add-on) plus 200 € für den Sponsor-Platz — der Verein zahlt dann nichts. Reihenfolge und Umfang entscheiden wir mit den Vereinen.",
    eintraege: [
      {
        titel: "Mitgliederverwaltung und Online-Beitritt",
        status: "geplant",
        text: "Stammdaten, Eintritt und Austritt, Zuordnung zu Mannschaften, Online-Beitrittsformular mit Einwilligungen (DSGVO, Fotos bei Minderjährigen), Export. 200 €/Jahr zusätzlich zur Basis — förderfähig über #deinehrenamt.de (Landessportbund Hessen, bis zu 30.000 € pro Projekt).",
      },
      {
        titel: "Beiträge und SEPA",
        status: "idee",
        text: "Beitragsklassen, SEPA-Lastschrift mit Mandaten, Zahlungsübersicht und Erinnerungen.",
      },
      {
        titel: "Neuigkeiten und Mitteilungen",
        status: "idee",
        text: "Eine Neuigkeiten-Seite je Verein, freie Rundmails an Gruppen, Mitteilungen an Mannschaften (heute gibt es nur automatische Mails, z. B. zu offenen Diensten).",
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
        titel: "Sponsor für einen Verein übernehmen",
        status: "geplant",
        text: "Wer als Sponsor einem Handballverein die App ermöglichen möchte — nur die Basis oder inklusive Vereinsverwaltung — kann sich melden. Der Sponsor übernimmt den kompletten Vereinspreis plus 200 € für den Sponsor-Platz (Bild beim Öffnen der Vereinsseite). Der Verein zahlt nichts. Interessierte Sponsoren melden sich bei info@deweconsulting.de.",
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <ZurueckButton fallbackHref="/" />
      </div>
      <h1 className="font-heading text-2xl font-semibold">Roadmap</h1>
      <p className="text-sm text-muted-foreground">
        {`Woran wir gerade arbeiten und was danach kommen könnte. Die App ist in der Beta, die Beta endet am ${BETA_ENDE}. Wir halten diese Seite aktuell. Stand: `}
        {STAND}.
      </p>
      <ul
        className="flex flex-wrap gap-2 text-xs"
        aria-label="Legende"
      >
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.fertig}`}>
          {STATUS_LABEL.fertig}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.in_arbeit}`}>
          {STATUS_LABEL.in_arbeit}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.geplant}`}>
          {STATUS_LABEL.geplant}
        </li>
        <li className={`rounded-full px-2.5 py-1 font-medium ${STATUS_CLASS.idee}`}>
          {STATUS_LABEL.idee}
        </li>
      </ul>
      {abschnitte.map((abschnitt) => (
        <section
          key={abschnitt.id}
          id={abschnitt.id}
          className="flex flex-col gap-3 scroll-mt-6"
        >
          <div>
            <h2 className="font-heading text-lg font-medium">
              {abschnitt.titel}
            </h2>
            <p className="text-xs font-medium text-muted-foreground">
              {abschnitt.zeit}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{abschnitt.einleitung}</p>
          <ul className="flex flex-col gap-2">
            {abschnitt.eintraege.map((eintrag) => (
              <Karte key={eintrag.titel} eintrag={eintrag} />
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <h2 className="font-heading text-base font-medium text-foreground">
          Wunsch oder Fehler melden
        </h2>
        <p>
          Etwas fehlt oder stimmt nicht? Schreibt uns an{" "}
          <a href="mailto:info@deweconsulting.de" className="underline">
            info@deweconsulting.de
          </a>
          . Hilfe zur App findet ihr unter{" "}
          <Link href="/app-hilfe" className="underline">
            Hilfe zur App
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
