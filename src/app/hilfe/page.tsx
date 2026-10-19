import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ZurueckButton } from "@/components/zurueck-button";

export const metadata = {
  title: "Hilfe: App einrichten, Vereinsseite, Dienste – HandballerPate",
};

// Nur im eingeloggten Zustand erreichbar (siehe publicRoutes in
// src/proxy.ts) — Vereins-Funktionsträger UND System-Admins sollen den
// Link im Header sehen (siehe hilfe-link.tsx-Verwendung u.a. in
// system/layout.tsx), daher hier bewusst nur ein einfacher auth()-Check
// statt requireSession() (das zwingend eine vereinId voraussetzt, die
// System-Admins nicht haben).
export default async function HilfePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <ZurueckButton fallbackHref="/profil" />
      </div>

      <h1 className="font-heading text-2xl font-semibold">Hilfe</h1>

      <nav aria-label="Inhalt" className="rounded-lg border bg-muted/30 p-4">
        <p className="mb-2 text-sm font-medium">Inhalt</p>
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ["erste-schritte", "Erste Schritte: App einrichten"],
            ["anmelden", "Anmelden, Passwort, E-Mail ändern"],
            ["rollen", "Wer darf was? Rollen"],
            ["mannschaften", "Mannschaften"],
            ["funktionstraeger", "Funktionsträger anlegen & Excel-Import"],
            ["oeffentliche-seite", "Öffentliche Vereinsseite & App"],
            ["spielhallen", "Eure Spielhallen (Heimspiele)"],
            ["spielgemeinschaft", "Spielgemeinschaften & Partnervereine"],
            ["gesperrte-ids", "Vereins-ID gesperrt? Änderung beantragen"],
            ["kalender", "Kalender & Besetzung"],
            ["eigene-termine", "Freundschaftsspiele & Turniere"],
            ["bedarf", "Dienste und Bedarf festlegen"],
            ["eigene-dienste", "Eigene Dienste (z.B. Fahrer, Kuchen)"],
            ["fahrgemeinschaft", "Fahrgemeinschaft (Plätze je Auto, Mitfahrer)"],
            ["warte", "Die Wart-Seiten: wo, was, wer"],
            ["zuordnung", "Dienste verteilen & Selbsteintragung"],
            ["abmeldungen", "Wenn jemand doch nicht kann"],
            ["trainingsplan", "Trainingsplan"],
            ["training", "Training: Ausfälle & freie Hallenzeiten"],
            ["vereinstermine", "Vereinstermine (Sitzungen) mit Zu- und Absage"],
            ["mitglieder", "Mitglieder (Add-on Vereinsverwaltung)"],
            ["darstellung", "Neues App-Design (Darstellung)"],
            ["ics-feed", "Persönlicher Kalender (ICS-Feed)"],
            ["mails", "E-Mails & Erinnerungen"],
            ["statistik", "Statistik & offene Dienste"],
            ["auswertung", "Auswertung & Export"],
            ["kosten", "Beta, Kosten & Verein löschen"],
            ["support", "Support, Feedback, Datenschutz"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="erste-schritte" className="flex flex-col gap-3 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Erste Schritte: HandballerPate einrichten</h2>
        <p className="text-sm text-muted-foreground">
          In dieser Reihenfolge ist euer Verein in wenigen Minuten startklar. Auf der <strong>Übersicht</strong> im
          Admin-Bereich zeigt euch die Liste „Erste Schritte“, was noch offen ist (sie verschwindet, sobald alles
          eingerichtet ist).
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Anmelden und AVV bestätigen:</strong> Der Vereinsadmin meldet sich per E-Mail-Link oder Passwort an und
            bestätigt beim ersten Login den Auftragsverarbeitungsvertrag.
          </li>
          <li id="einrichtung-assistent" className="scroll-mt-6">
            <strong>Spielplan anbinden (Einrichtungs-Assistent):</strong> Direkt nach dem ersten Login öffnet sich der{" "}
            <Link href="/admin/einrichtung" className="font-medium underline">
              Assistent
            </Link>
            . Ihr gebt an, wo eure Mannschaften gelistet sind (<strong>nuLiga</strong>, <strong>handball.net</strong> oder
            „beides / weiß ich nicht“) und tragt die Vereins-ID ein (<a href="#oeffentliche-seite" className="font-medium underline">so findet ihr sie</a>);
            bei nuLiga schlagen wir euren Verein anhand des Namens vor. Der Assistent lädt dann Mannschaften, Spielplan, Hallen und Logo und legt die
            Heimspiele als Termine an (dauert bis zu einer Minute, es wird keine Mail verschickt). Mit „Später“ richtet ihr alles selbst unter{" "}
            <Link href="/admin/einstellungen#oeffentliche-seite" className="font-medium underline">
              Einstellungen → Öffentliche Vereinsseite
            </Link>{" "}
            ein. Danach kommen Spiele, Verlegungen, Ergebnisse und die Schiedsrichter-Ansetzung automatisch, tagsüber stündlich.
          </li>
          <li>
            <strong>Eure Spielhallen eintragen:</strong> direkt darunter unter{" "}
            <Link href="/admin/einstellungen#spielhallen" className="font-medium underline">
              Eure Spielhallen
            </Link>
            . <strong>Wichtig:</strong> Nur Spiele in diesen Hallen werden als Heimspiel angelegt, für das ihr Dienste
            einteilen könnt (<a href="#spielhallen" className="font-medium underline">mehr dazu</a>).
          </li>
          <li>
            <strong>Mannschaften prüfen:</strong> Mit angebundenem Spielplan legt HandballerPate eure Mannschaften selbst an.
            Unter <Link href="/admin/mannschaften" className="font-medium underline">Mannschaften</Link> könnt ihr sie prüfen oder von Hand ergänzen.
          </li>
          <li>
            <strong>Funktionsträger anlegen:</strong> unter{" "}
            <Link href="/admin/funktionstraeger" className="font-medium underline">
              Funktionsträger
            </Link>{" "}
            einzeln oder per <a href="#funktionstraeger" className="font-medium underline">Excel-Import</a>: Schiedsrichter, Zeitnehmer/Sekretär, Ordner,
            Kioskdienst, Kassierer, Trainer und die Warte. Wer sich selbst einloggen soll, braucht eine E-Mail-Adresse.
          </li>
          <li>
            <strong>Dienste-Bedarf festlegen:</strong> unter{" "}
            <Link href="/admin/einstellungen#dienste-bedarf" className="font-medium underline">
              Einstellungen → Dienste
            </Link>
            , wie viele Ordner, Kioskdienste, Kassierer, Zeitnehmer/Sekretär und eigene Dienste je Veranstaltung gebraucht werden (
            <a href="#bedarf" className="font-medium underline">mehr dazu</a>). Ein Spiel gilt nur als <strong>vollständig besetzt</strong>, wenn auch
            diese Dienste ihren Bedarf erreichen. Braucht ihr noch etwas anderes, z.B. Fahrer oder Kuchen, legt es als{" "}
            <a href="#eigene-dienste" className="font-medium underline">eigenen Dienst</a> an.
          </li>
          <li>
            <strong>Aufgaben verteilen:</strong> die Warte (Schiedsrichter-, Zeitnehmer-, Ordnerwart) teilen auf ihren{" "}
            <a href="#warte" className="font-medium underline">Wart-Seiten</a> ein, und über die login-freie{" "}
            <a href="#selbsteintragung" className="font-medium underline">Selbsteintragung</a> tragen sich Eltern und Helfer
            selbst ein. Im{" "}
            <Link href="/admin/kalender" className="font-medium underline">
              Kalender
            </Link>{" "}
            seht ihr, welche Spiele vollständig besetzt sind; am Handy markiert ein Warnsymbol Tage mit offener Besetzung.
          </li>
          <li>
            <strong>Vereinsseite und App teilen:</strong> Logo und Farbe festlegen, dann den Link zu eurer Seite an Spieler,
            Eltern und Fans geben. Sie können die Seite als App installieren.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          <strong>Freundschaftsspiele und Turniere</strong> stehen nicht in den Liga-Daten: die legt ihr selbst an (
          <a href="#eigene-termine" className="font-medium underline">so geht&apos;s</a>).
        </p>
      </section>

      <section id="anmelden" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Anmelden, Passwort, E-Mail ändern</h2>
        <p className="text-sm text-muted-foreground">
          Ihr meldet euch mit eurer E-Mail-Adresse an: entweder mit einem <strong>Link, den wir euch per E-Mail schicken</strong>{" "}
          (kein Passwort nötig) oder, wenn ihr eins festgelegt habt, mit <strong>Passwort</strong>. Hat euch der Admin ein
          Einmal-Passwort gegeben, werdet ihr nach dem ersten Login gebeten, ein eigenes zu vergeben.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Link kommt nicht an?</strong> Schaut im Spam-Ordner nach und prüft, ob die Adresse richtig geschrieben ist (der
          Admin hinterlegt sie unter Funktionsträger). <strong>E-Mail-Adresse ändern:</strong> in eurem Profil (Einstellungen-Menü); die neue Adresse
          gilt erst, nachdem ihr den Bestätigungslink angeklickt habt, den wir an genau diese Adresse schicken.{" "}
          <strong>Passwort ändern:</strong> im selben Menü unter „Passwort ändern“.
        </p>
      </section>

      <section id="rollen" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Wer darf was? Rollen</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Vereinsadmin:</strong> sieht und ändert alles im Verein (Funktionsträger, Mannschaften, Termine, Einstellungen).
          </li>
          <li>
            <strong>Admin „nur lesend“:</strong> sieht dieselben Seiten, kann aber nichts ändern, z.B. für Kassenprüfer oder einen
            zweiten Vorstand.
          </li>
          <li>
            <strong>Warte (Schiedsrichter-, Zeitnehmer-, Ordner- und Dienstwart):</strong> ordnen auf ihrer Profil-Seite Personen zu den
            Terminen zu und verwalten ihre Selbsteintragungs-Links (<a href="#warte" className="font-medium underline">Wart-Seiten</a>).
          </li>
          <li>
            <strong>Alle anderen Funktionsträger</strong> (Schiedsrichter, Zeitnehmer/Sekretär, Ordner, Kioskdienst, Kassierer,
            Trainer): sehen im Profil ihre eigenen Einsätze, offene Dienste und ihren persönlichen Kalender.
          </li>
          <li>
            <strong>Trainer eintragen:</strong> Unter Funktionsträger → „Trainer-Links pro Mannschaft“ aktivierst du für jede Mannschaft einen Link.
            Die Trainer tragen sich darüber mit Name und E-Mail selbst ein (kein Login nötig) und werden von dir freigeschaltet.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Eine Person kann mehrere Rollen haben. Wer den Verein verlässt, wird deaktiviert, seine bisherigen Einsätze bleiben in der
          Historie.
        </p>
      </section>

      <section id="mannschaften" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Mannschaften</h2>
        <p className="text-sm text-muted-foreground">
          Ist der Spielplan angebunden, legt HandballerPate eure Mannschaften aus den Liga-Daten selbst an und ordnet neue
          Spiele automatisch der richtigen Mannschaft zu. Habt ihr schon eigene Mannschaften angelegt, legt es keine
          zusätzlichen an (keine Doppelten), sondern ordnet Spiele über den Namen zu. Unter{" "}
          <Link href="/admin/mannschaften" className="font-medium underline">
            Mannschaften
          </Link>{" "}
          könnt ihr Mannschaften umbenennen, ergänzen oder löschen. Gebraucht werden sie für die Zuordnung der Spiele, die
          Trainer und den Dienste-Bedarf je Mannschaft.
        </p>
        <p className="text-sm text-muted-foreground">
          Der Name auf der <strong>öffentlichen Vereinsseite</strong> ist davon getrennt und wird unter Einstellungen →
          Öffentliche Vereinsseite → „Namen der Mannschaften“ geändert (siehe unten).
        </p>
      </section>

      <section id="funktionstraeger" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Funktionsträger anlegen &amp; Excel-Import</h2>
        <p className="text-sm text-muted-foreground">
          Unter{" "}
          <Link href="/admin/funktionstraeger" className="font-medium underline">
            Funktionsträger
          </Link>{" "}
          legt ihr Personen mit Name, E-Mail-Adresse und einer oder mehreren Rollen an. Wer eine E-Mail-Adresse hat, bekommt
          eine Willkommensmail und kann sich selbst einloggen. Personen ohne E-Mail lassen sich trotzdem einteilen (z.B.
          „Ohne Login zuordnen“ auf den Wart-Seiten). Bekommt jemand eine <strong>Wart-Rolle</strong> oder die Rolle{" "}
          <strong>Trainer</strong> (neu angelegt, aktiviert oder später ergänzt), steht in der Mail gleich eine kurze Starthilfe: bei
          Warten der Link zur eigenen Seite (der Button führt nach dem Login direkt dorthin, dort wartet die Karte „So legst du los“), bei
          Trainern, was sie im Profil sehen und dass sie bei Verlegungen eine Info-Mail bekommen.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Viele Personen auf einmal:</strong> „Aus Excel importieren“ mit einer Kopfzeile mit den Spalten{" "}
          <strong>Name</strong>, <strong>E-Mail</strong>, <strong>Rolle</strong> (Schiedsrichter, Zeitnehmer/Sekretär,
          Trainer, Ordner, Kioskdienst oder Kassierer), optional <strong>Mannschaft</strong> (nur bei Trainern, muss es als
          Mannschaft geben) und optional <strong>Lizenz gültig bis</strong> (TT.MM.JJJJ). Mehrere Rollen pro Person: mehrere
          Zeilen mit derselben E-Mail-Adresse. Bereits vorhandene Personen und Rollen werden übersprungen, nicht doppelt
          angelegt.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Zeitnehmer und Sekretär</strong> sind in HandballerPate eine Funktion: wer eine davon hat, kann beide
          Aufgaben übernehmen. <strong>Trainer</strong> können sich auch selbst eintragen: unter Funktionsträger →
          „Trainer-Links pro Mannschaft“ einen Link je Mannschaft freischalten und an den Trainer schicken.
        </p>
      </section>

      <section id="oeffentliche-seite" className="flex flex-col gap-3 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">
          Öffentliche Vereinsseite einrichten
        </h2>
        <p className="text-sm text-muted-foreground">
          Jeder Verein bekommt eine öffentliche Seite ohne Login:{" "}
          <strong>letzte Ergebnisse</strong>, <strong>nächste Spiele</strong>{" "}
          und alle <strong>Mannschaften</strong> mit Tabellenplatz, Spielplan und
          Tabelle. Dazu gibt es einen Reiter <strong>Statistik</strong> mit Kennzahlen je Mannschaft. Spieler, Eltern und Fans finden die Seite in der
          Vereinssuche auf der Startseite, können Mannschaften auf ihrem Handy merken und die Seite als App installieren. Es werden nur öffentliche Sportdaten
          übernommen, keine Personen.
        </p>

        <h3 className="text-sm font-medium">1. Einrichten</h3>
        <p className="text-sm text-muted-foreground">
          Unter <strong>Einstellungen → Öffentliche Vereinsseite</strong> tragt
          ihr die Vereins-ID eurer Quelle ein und klickt auf{" "}
          <strong>Speichern &amp; Seite erstellen</strong>. Beide Quellen lassen
          sich kombinieren, dann stehen alle Mannschaften zusammen auf einer Seite. Die Männer-Mannschaften der 1. und 2. Handball-Bundesliga
          kommen vom NDR; sie ordnet der Betreiber zu, meldet euch dafür über den Feedback-Button:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>nuLiga-Vereins-ID</strong> (Landesverband, z.B. Kreis- bis
            Oberliga): die Zahl hinter <code className="text-xs">club=</code> in
            der Adresse eurer Vereinsseite auf nuLiga, z.B.{" "}
            <code className="text-xs">…clubTeams?club=69723</code>.
          </li>
          <li>
            <strong>handball.net-Vereins-ID</strong> (DHB-Wettbewerbe wie 3. Liga,
            Jugendbundesliga): auf handball.net euren Verein suchen und die Adresse
            ansehen, der Teil hinter <code className="text-xs">/club/</code> ist die
            ID, z.B. <code className="text-xs">handball.net/club/18rmntb</code>.
          </li>
          <li>
            <strong>handball.net-Team-IDs</strong> (optional): nur nötig, wenn eine
            Mannschaft nicht automatisch gefunden wird. Die Zahl hinter{" "}
            <code className="text-xs">/team/</code> in der Adresse der Mannschaft,
            mehrere durch Komma getrennt.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Das erste Laden kann etwas dauern. Reicht eine Minute nicht aus, lädt
          die Seite nach einer kurzen Pause automatisch weiter. Danach hält
          HandballerPate die Daten selbst aktuell, am Spieltag öfter als sonst.
          Mit <strong>Jetzt aktualisieren</strong> holt ihr sofort den neuesten Stand.
        </p>

        <h3 className="text-sm font-medium">2. Namen der Mannschaften anpassen</h3>
        <p className="text-sm text-muted-foreground">
          Standard ist der Name aus der Quelle. Unter{" "}
          <strong>Namen der Mannschaften</strong> könnt ihr für jede Mannschaft
          einen eigenen Namen vergeben, z.B. aus „Männer II“ „Männer 1“. Lasst
          das Feld leer, gilt wieder der Standardname. Der eigene Name bleibt bei
          jeder Aktualisierung erhalten. Die Adresse der Mannschaftsseite ändert
          sich dadurch nicht, bestehende Links und gemerkte Favoriten funktionieren
          weiter.
        </p>

        <h3 className="text-sm font-medium">3. Logo und Farbe</h3>
        <p className="text-sm text-muted-foreground">
          Das Logo (PNG, JPEG oder WebP, höchstens 5 MB, am besten quadratisch)
          erscheint im Kopf der Seite und als Icon der App. Die Farbe der Seite
          wird standardmäßig aus dem Logo abgeleitet, ohne Logo gibt es eine
          Standardfarbe. Unter <strong>Einstellungen → Öffentliche Vereinsseite → Farbe</strong>{" "}
          könnt ihr sie selbst wählen (Farbwähler) oder mit „Zurück zur Farbe aus dem Logo“
          wieder zurücksetzen. Helligkeit und Lesbarkeit regelt die Seite selbst.
        </p>

        <h3 className="text-sm font-medium">Live-Ticker, Spielbericht und Zwischenstände</h3>
        <p className="text-sm text-muted-foreground">
          Auf den Spielkarten gibt es bei nuLiga-Spielen einen Link zum <strong>Live-Ticker</strong> (rund um das Spiel) und
          zum <strong>Spielbericht</strong> (sobald ein Ergebnis angezeigt wird). Beides erscheint erst, wenn nuLiga den
          Spielbericht angelegt hat. Bei der 1. und 2. Handball-Bundesliga führt ein Link zur Spielseite des NDR (während des Spiels als
          Live-Ticker, danach als Spielbericht), bei handball.net-Spielen führt der Link rund um das Spiel zur Spielseite bei handball.net (dort der Tab „Liveticker“), einen Spielbericht-Link gibt es nicht. Während ein Spiel läuft, zeigt die Karte „Live“ und „Läuft gerade“ statt einer Zahl,
          danach „Ergebnis folgt“: Wir zeigen nur ein Endergebnis. Ein bei nuLiga eingetragener, aber noch nicht genehmigter Stand kann ein Zwischenstand oder veraltet sein
          (nuLiga sagt nicht, welches), deshalb erscheint die Zahl erst, wenn der Spielbericht genehmigt ist; nur wenn das drei Stunden nach dem Spiel noch nicht
          passiert ist, zeigen wir den Stand mit „vorläufig“. Am Spieltag wird rund um den Anwurf häufiger abgerufen, sonst stündlich; den aktuellen Spielstand liefert der Live-Ticker.
        </p>

        <h3 className="text-sm font-medium">Eine Mannschaft fehlt oder ist leer?</h3>
        <p className="text-sm text-muted-foreground">
          Nach dem Aktualisieren erscheinen unter dem Ergebnis Hinweise. Die
          häufigsten Ursachen:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Zurückgezogen:</strong> Steht in der Tabelle „zurückgezogen
            am …“, nimmt die Mannschaft nicht teil und wird ausgeblendet.
          </li>
          <li>
            <strong>Spielplan noch nicht veröffentlicht:</strong> Der Verband hat
            noch keine Spiele angesetzt. Sobald sie da sind, erscheinen sie
            automatisch.
          </li>
          <li>
            <strong>Meldeliste:</strong> Mannschaften, die nur gemeldet, aber noch
            keiner Staffel zugeteilt sind, haben noch keinen Spielplan.
          </li>
          <li>
            <strong>DHB-Mannschaft fehlt:</strong> handball.net-Vereins-ID prüfen
            oder die Team-ID der Mannschaft manuell eintragen.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Gut zu wissen: Die Tabelle von handball.net-Mannschaften wird aus den
          Spielergebnissen berechnet (2 Punkte für einen Sieg, 1 für ein
          Unentschieden). Den direkten Vergleich bei Punktgleichheit
          berücksichtigt sie nicht, daher kann die Reihenfolge dort vom
          offiziellen Stand abweichen.
        </p>

        <h3 className="text-sm font-medium">Seite entfernen</h3>
        <p className="text-sm text-muted-foreground">
          Mit <strong>Seite entfernen</strong> verschwindet die öffentliche Seite
          eures Vereins samt eigenen Namen und Logo. Eure Vereinsdaten in
          HandballerPate bleiben davon unberührt. Sind schon Dienste eingetragen, geht das nur noch per{" "}
          <a href="#gesperrte-ids" className="font-medium underline">Änderungsantrag</a>.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Ausblick Handball360:</strong> Der DHB stellt den Spielbetrieb schrittweise auf das neue System
          Handball360 um, das nuLiga ablösen soll. Ändert sich dadurch die Datenquelle, passen wir den Abruf an; ihr müsst
          dafür nichts tun.
        </p>
      </section>

      <section id="spielhallen" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Eure Spielhallen: welche Spiele werden Heimspiele?</h2>
        <p className="text-sm text-muted-foreground">
          Die Liga-Daten enthalten alle Spiele eurer Mannschaften, auch auswärts und auch Heimspiele, die z.B. in einer
          fremden Halle stattfinden. Für die Einteilung von Diensten zählen nur Spiele <strong>in euren Hallen</strong>.
          Deshalb tragt ihr unter{" "}
          <Link href="/admin/einstellungen#spielhallen" className="font-medium underline">
            Einstellungen → Öffentliche Vereinsseite → Eure Spielhallen
          </Link>{" "}
          eure Hallen ein: eine pro Zeile, ein eindeutiger Teil des Namens reicht (z.B. „Sporthalle Heuchelheim“),
          Groß-/Kleinschreibung ist egal.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Ohne Eintrag wird kein Heimspiel angelegt</strong>, der Kalender bleibt leer. Nach dem Speichern werden
          passende künftige Heimspiele beim nächsten Abgleich (tagsüber stündlich) angelegt. Eine Hallen-ID braucht ihr
          dafür nicht mehr, die Vereins-ID genügt. Den Hallennamen eines Spiels seht ihr auf eurer öffentlichen Vereinsseite
          oder bei nuLiga.
        </p>
      </section>

      <section id="spielgemeinschaft" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Spielgemeinschaften &amp; Partnervereine</h2>
        <p className="text-sm text-muted-foreground">
          Läuft eine Mannschaft unter einem anderen Verein, z.B. eine Jugendspielgemeinschaft, die bei nuLiga beim
          Partnerverein gemeldet ist, fehlt sie zunächst. Unter Einstellungen → Öffentliche Vereinsseite →{" "}
          <strong>„Weitere nuLiga-Vereine (z.B. Spielgemeinschaft)“</strong> tragt ihr die Vereins-ID des Partnervereins ein
          (nuLiga oder handball.net) und wählt, welche Mannschaften übernommen werden: nach Bereich (Männer, Frauen,
          weibliche/männliche Jugend, Kinder) und optional einem Namensteil, z.B. „Heuchelheim“ für die „wJSG
          Bieber/Heuchelheim“. Übernommen werden nur die passenden Mannschaften, nie der ganze Partnerverein.
        </p>
        <p className="text-sm text-muted-foreground">
          Einzelne DHB-Mannschaften (handball.net), die nicht automatisch gefunden werden, tragt ihr dort als{" "}
          <strong>handball.net-Team-IDs</strong> ein (siehe oben).
        </p>
      </section>

      <section id="gesperrte-ids" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Vereins-ID gesperrt? Änderung beantragen</h2>
        <p className="text-sm text-muted-foreground">
          Sobald für einen Termin ein Dienst eingetragen ist, lassen sich die Vereins-IDs, Team-IDs und Partnervereine nicht
          mehr selbst ändern oder entfernen. Grund: Termine und eingetragene Dienste hängen daran. Mit einer anderen ID würden
          die Spiele als zweite Termine neu angelegt und die Einteilungen gingen am alten Termin verloren. Ein leeres Feld zu
          füllen und „Jetzt aktualisieren“ gehen weiterhin, ebenso die Spielhallen.
        </p>
        <p className="text-sm text-muted-foreground">
          Muss doch etwas geändert werden, nutzt ihr unter Einstellungen → Öffentliche Vereinsseite →{" "}
          <strong>„Änderung beantragen“</strong> mit einem kurzen Grund. Wir prüfen den Antrag, setzen die Änderung so um,
          dass nichts verloren geht, und ihr bekommt eine Mail.
        </p>
      </section>

      <section id="kalender" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Kalender &amp; Besetzung</h2>
        <p className="text-sm text-muted-foreground">
          Der <strong>Kalender</strong> ist der eine Ort für alles, was im Verein stattfindet: <strong>Spiele &amp; Dienste</strong>,{" "}
          <strong>Training</strong> (ausfallende Trainings durchgestrichen) und <strong>Vereinstermine</strong> (Sitzungen u.ä.). Über die Filter oben
          („Anzeigen“) blendet ihr Arten aus oder ein; die Auswahl bleibt beim Blättern erhalten. Im Profil zeigt „Mein Kalender“ dasselbe für euch
          persönlich: eure Einsätze, dazu Trainings (als Trainer die eurer Mannschaften, bei eingeschalteter Option alle) und die Vereinstermine, die ihr sehen
          dürft. Ein Eintrag öffnet seine Details mit einem Link zur passenden Seite („Zum Training“, „Zu- oder absagen“, „Termin verwalten“). Ein Spiel zeigt <strong>„Vollständig“</strong> (grün,
          Häkchen), wenn Schiedsrichter (falls der Verein ihn stellen muss), Zeitnehmer/Sekretär und alle festgelegten
          Helferdienste besetzt sind, sonst <strong>„Offen“</strong> (rot, Ausrufezeichen). Am Handy markiert ein kleines
          Warnsymbol die Tage, an denen noch etwas offen ist. Tippt einen Termin an, um Details zu sehen und Personen
          zuzuordnen. Termine, die automatisch aus Liga-Daten kommen, sind nicht bearbeitbar; eine Verlegung übernimmt
          HandballerPate selbst.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Ein Spiel fehlt oder ist falsch?</strong> Die Liga-Daten werden tagsüber stündlich geholt. Prüft im Zweifel die
          Vereins-ID unter Einstellungen → Öffentliche Vereinsseite oder meldet es über den Feedback-Button.
        </p>
      </section>

      <section id="eigene-termine" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Freundschaftsspiele &amp; Turniere</h2>
        <p className="text-sm text-muted-foreground">
          Freundschaftsspiele und Turniere stehen nicht in den Liga-Daten, ihr legt sie selbst an: unter{" "}
          <Link href="/admin/termine?tab=testspiele" className="font-medium underline">
            Spiele &amp; Turniere → Freundschaftsspiele &amp; Turniere
          </Link>{" "}
          über <strong>„Neuer Termin“</strong> mit Typ, Start, Ort, Gegner und optional der Mannschaft. Danach werden sie wie
          Ligaspiele besetzt; der Bedarf richtet sich nach der Veranstaltungsart (<a href="#bedarf" className="font-medium underline">Dienste-Bedarf</a>),
          einen Schiedsrichter stellt ihr hier selbst.
        </p>
        <p className="text-sm text-muted-foreground">
          Bei einem <strong>Turnier</strong> könnt ihr in der Termin-Ansicht die einzelnen Spiele als Spielplan anlegen und
          einen <strong>öffentlichen Link</strong> teilen, über den andere Vereine und Eltern den Spielplan ohne Login sehen.
        </p>
      </section>

      <section id="mitglieder" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Mitglieder (Add-on Vereinsverwaltung)</h2>
        <p className="text-sm text-muted-foreground">
          Die Mitgliederverwaltung gehört zum Zusatzangebot <strong>Vereinsverwaltung</strong>. Wir schalten sie für euren Verein frei; danach gibt es im Admin-Menü{" "}
          <strong>Verein → Mitglieder</strong>. Ohne Freischaltung zeigt die Seite nur einen Hinweis. Die Mitgliederdaten sehen ausschließlich Vereinsadmins,
          sie erscheinen nie auf der öffentlichen Vereinsseite.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Anlegen und bearbeiten:</strong> Vor- und Nachname sind Pflicht, alles andere (Geburtsdatum, Geschlecht, E-Mail, Telefon, Eintritt, Bemerkung) ist
          freiwillig. Ein Mitglied ist <em>Aktiv</em>, <em>Passiv</em> oder <em>Ausgetreten</em>; bei „Ausgetreten“ wird das Austrittsdatum auf heute gesetzt, wenn ihr
          keines eintragt. Für einen Austritt nehmt den Status, damit die Angaben erhalten bleiben; „Löschen“ entfernt das Mitglied endgültig. Nur Admins mit
          Schreibzugriff können ändern, lesende Admins sehen die Liste.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Funktionsträger sind automatisch Mitglieder:</strong> Funktionsträger funktionieren auch ohne Vereinsverwaltung. Sobald das Add-on freigeschaltet
          ist, werden alle Funktionsträger (Personen mit mindestens einer Rolle) einmalig als Mitglieder übernommen, danach auch jede neu angelegte Person. Dabei wird
          nichts doppelt angelegt: Ein vorhandenes Mitglied mit <em>gleicher E-Mail-Adresse</em> oder <em>gleichem Namen</em> (ohne abweichende Adresse) wird nur mit dem
          Funktionsträger verknüpft. Gleicher Name, aber andere Adresse kann dieselbe Person sein oder nicht: dann wird nichts angelegt, die Mitgliederseite zeigt
          den Fall unter „Funktionsträger und Mitglieder abgleichen“ zur Prüfung. Personen ohne Vor- und Nachnamen (nur ein Wort) lassen sich nicht übernehmen: auf der Abgleich-Karte ergänzt ihr den
          Nachnamen direkt (er wird auch beim Funktionsträger gesetzt, die Person wird sofort übernommen). Übernommene Funktionsträger sind immer „Aktiv“, auch wenn sie noch
          nicht für den Login freigeschaltet sind. Vorhandene Mitgliedsdaten werden nie überschrieben. Beim Anlegen von Hand prüft die App ebenfalls auf Doppelte; bei einer anderen Person mit
          gleichem Namen setzt ihr den Haken „Trotzdem neu anlegen“.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Art der Mitgliedschaft:</strong> Unter „Arten der Mitgliedschaft verwalten“ legt ihr eigene Arten an (z.B. Aktives Mitglied, Fördermitglied, Ehrenmitglied,
          Kind/Jugend), mit „Übliche Arten anlegen“ übernehmt ihr Vorschläge. Beim Mitglied wählt ihr eine davon aus (freiwillig); sie erscheint als Markierung auf der
          Karte, und die Suche kann danach filtern. Eine Art lässt sich umbenennen oder löschen, die Mitglieder bleiben dabei bestehen. Der Status (Aktiv, Passiv,
          Ausgetreten) bleibt davon getrennt.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Mannschaften zuordnen:</strong> Jedes Mitglied lässt sich je Saison einer oder mehreren Mannschaften zuordnen, als <em>Spieler/in</em>, <em>Trainer/in</em> oder{" "}
          <em>Betreuer/in</em> (auf der Karte des Mitglieds unter „Mannschaften“). Zur Auswahl stehen die Mannschaften aus eurem angebundenen Spielplan (Einstellungen →
          Öffentliche Vereinsseite); ohne Spielplan gibt es noch keine. Dieselbe Zuordnung in derselben Saison wird nicht doppelt angelegt, ältere Saisons bleiben als Verlauf
          stehen. Die Zuordnung ist freiwillig: Fördermitglieder, Vorstand oder Passive brauchen keine Mannschaft. Mit dem Filter „Mannschaft“ seht ihr, wer in der laufenden Saison zu einer bestimmten Mannschaft gehört, oder mit „Ohne Mannschaft“, wer keiner zugeordnet ist.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Excel-Import und -Export:</strong> Unter „Excel-Import und -Export“ ladet ihr eine Vorlage herunter, tragt die Mitglieder ein und importiert die Datei.
          Pflicht sind nur Vorname und Nachname; Datum als TT.MM.JJJJ, Geschlecht männlich/weiblich/divers, Status Aktiv/Passiv/Ausgetreten, eine noch unbekannte Art wird neu
          angelegt. Wer es schon gibt (gleiche E-Mail-Adresse oder gleicher Name, auch doppelt in der Datei), wird übersprungen; fehlerhafte Zeilen werden nicht importiert und
          mit Zeilennummer aufgelistet, der Rest wird trotzdem angelegt. Mannschaften werden nicht importiert, ordnet sie danach zu. Der Export enthält die Mitglieder mit den
          aktuellen Filtern der Liste und zusätzlich die Mannschaften der laufenden Saison; die Datei enthält Personendaten, geht sorgfältig damit um. Import und Export werden
          im Vereinsprotokoll vermerkt.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong id="online-beitritt" className="scroll-mt-6">Online-Beitritt:</strong> Unter <strong>Einstellungen → Online-Beitritt</strong> schaltet ihr ein öffentliches Formular ein
          (<code>/verein/…/beitritt</code>, braucht die öffentliche Vereinsseite) und hinterlegt optional den Link zur Satzung. Interessierte tragen Name, Geburtsdatum, E-Mail und
          freiwillig Telefon, Geschlecht und Wunschmannschaft ein und bestätigen Datenschutz (und, wenn ihr einen Satzungslink hinterlegt habt, die Satzung); die Foto-Einwilligung ist freiwillig.
          Der Antrag erscheint unter <strong>Verein → Mitglieder → Beitrittsanträge</strong>, alle Admins mit eingeschalteten Admin-Hinweisen bekommen eine Mail mit Name und E-Mail. Mit{" "}
          <em>Annehmen</em> wird die Person Mitglied (aktiv, Eintritt heute, Wunschmannschaft für die laufende Saison, die Einwilligungen stehen in der Bemerkung) und bekommt eine Willkommens-Mail;
          mit <em>Ablehnen</em> bekommt sie eine Absage, auf Wunsch mit eurem Hinweis. Gibt es das Mitglied wohl schon (gleiche E-Mail oder gleicher Name), nehmt ihr nur nach ausdrücklicher
          Bestätigung „Trotzdem als neues Mitglied annehmen“ an. Bearbeitete Anträge bleiben als Nachweis der Einwilligungen gespeichert, bis ihr sie löscht. Gegen Missbrauch gibt es ein
          verstecktes Köderfeld und eine Grenze von 20 Anträgen je Stunde. <strong>Admin-Hinweise:</strong> Mindestens ein Admin im Verein muss sie aktiv haben, der letzte kann sie nicht
          abschalten (Profil → Benachrichtigungen bzw. Abmelde-Link der Mail).
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Suchen und filtern:</strong> Die Suche findet Vor- und Nachname sowie E-Mail (mehrere Wörter müssen alle passen), der Filter zeigt nur einen
          Status. Die Liste ist nach Nachname sortiert. Noch nicht enthalten, aber geplant: Beitragsklassen und Beiträge (siehe{" "}
          <Link href="/roadmap" className="font-medium underline">
            Roadmap
          </Link>
          ).
        </p>
      </section>

      <section id="darstellung" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Neues App-Design (Darstellung)</h2>
        <p className="text-sm text-muted-foreground">
          Unter <strong>Profil → Einstellungen → Darstellung</strong> schaltest du für dich das neue Design ein oder wieder aus. Es gilt nur für dein Konto.
          Der Demo-Verein und Vereine, die ab dem 19.10.2026 registriert wurden, starten gleich mit dem neuen Design; bestehende Vereine behalten zunächst die gewohnte Ansicht. Die Startseite wird zum Dashboard: oben die Karte <strong>„Heute“</strong> (Admins: das nächste
          Spiel mit Besetzung; sonst dein nächster Einsatz), darunter <strong>„Braucht dich“</strong> mit offenen Aufgaben und große <strong>Kacheln</strong> für
          die Bereiche. Admins finden die Bereiche (Spielbetrieb, Dienste, Verein, Auswertung) als Übersichtsseiten mit großen Tasten; auf dem Rechner
          steht links eine Seitenleiste. Alle bisherigen Karten und Seiten bleiben unverändert darunter bzw. erreichbar.
        </p>
      </section>

      <section id="ics-feed" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">
          Persönlicher Schiedsrichter-Kalender (HHV Funktionsträger ICS-Feed)
        </h2>
        <p className="text-sm text-muted-foreground">
          Wenn ihr bei eurem Verband (z.B. dem HHV über nuLiga) als
          Schiedsrichter bzw. Funktionsträger gemeldet seid, bekommt ihr
          dort einen persönlichen Kalender-Abo-Link für eure eigenen
          Ansetzungen: im passwortgeschützten persönlichen Bereich von
          nuLiga (das ist der Verbands-Login, NICHT der Login hier bei
          HandballerPate) unter <strong>Downloads</strong> findet ihr einen
          ICS-Kalenderlink für eure Schiedsrichter-Ansetzungen.
        </p>
        <p className="text-sm text-muted-foreground">
          Diesen Link kopiert ihr anschließend in eurem HandballerPate-Profil
          unter <strong>Einstellungen → HHV Funktionsträger ICS-Feed</strong>{" "}
          ein. Ab dann werden alle eure Einsätze automatisch mit
          HandballerPate synchronisiert — ihr müsst nichts mehr manuell
          eintragen.
        </p>
      </section>

      <section id="bedarf" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">
          Wie wird der Bedarf pro Dienst festgelegt?
        </h2>
        <p className="text-sm text-muted-foreground">
          Alle Dienste stehen an einer Stelle:{" "}
          <Link href="/admin/einstellungen#dienste-bedarf" className="font-medium underline">
            Einstellungen → Dienste
          </Link>
          . Jeder Dienst, ob fest eingebaut (Ordner, Kioskdienst, Kassierer, Zeitnehmer/Sekretär) oder selbst angelegt (z.B. Fahrer,
          Kuchen), wird gleich eingestellt:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Personen je Termin</strong>, getrennt für <strong>Heimspiel</strong>, <strong>Auswärtsspiel</strong>,{" "}
            <strong>Freundschaftsspiel</strong> und <strong>Turnier</strong>. 0 heißt: bei dieser Veranstaltung nicht gebraucht. Ein
            Turnier braucht meist mehr Helfer als ein Ligaspiel; Auswärtsspiele gibt es nur für eigene Dienste (z.B. Fahrer), die
            festen Dienste sind Heimdienste.
          </li>
          <li>
            <strong>Mannschaften:</strong> alle oder nur ausgewählte, z.B. Kioskdienst nur bei den Senioren oder Fahrer nur für die
            Jugend. Die Liste ist nach Klasse sortiert (Männer, Frauen, dann Jugend A bis E) und zeigt die Altersklasse; heißen zwei
            Mannschaften gleich, steht die Staffel dahinter.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Zeitnehmer/Sekretär zählt beide zusammen (2 = ein Zeitnehmer und ein Sekretär). Ein Spiel zählt im Kalender und im
          Dashboard erst als <strong>vollständig besetzt</strong>, wenn alle Dienste mit Bedarf ihn erreichen; ein Bedarf von 0 oder
          eine nicht ausgewählte Mannschaft zählt nicht. Die Mannschaftsauswahl der festen Dienste ist dieselbe wie „Bedarf pro
          Mannschaft“ auf den Seiten Ordnerwart und Zeitnehmerwart: eine Änderung an einer Stelle gilt überall.
        </p>
        <p className="text-sm text-muted-foreground">
          Für einzelne Termine lässt sich der Bedarf zusätzlich überschreiben: der Zeitnehmerwart für Zeitnehmer/Sekretär, der
          Ordnerwart für Ordner, Kioskdienst und Kassierer, der Dienstwart für eigene Dienste, jeweils über{" "}
          <strong>„Bedarf anpassen“</strong> (auch auf 0, z.B. „bei diesem Spiel kein Kiosk“, oder auf mehr als sonst). Ein leeres Feld
          bedeutet wieder den Standard. Bei einem persönlichen Schiedsrichter-Einsatz (ICS-Feed, siehe oben) lässt sich so
          ausnahmsweise doch ein Zeitnehmer anfordern.
        </p>
        <p className="text-sm text-muted-foreground">
          Der Schiedsrichter ist ein Sonderfall ohne eigenen Bedarfswert:
          Bei echten Ligaspielen (Pflichtspielen) stellt der Verband über
          nuLiga/handball.net automatisch den Schiedsrichter — hier gibt es
          nichts einzustellen, und HandballerPate bietet dafür auch keine
          eigene Zuordnung an. Nur bei Freundschaftsspielen, Turnierspielen
          und Rundenspielen, die <strong>kein</strong> Pflichtspiel sind,
          ordnet der Verein selbst (max. 2 Personen als Gespann) einen
          Schiedsrichter zu.
        </p>
      </section>

      <section id="eigene-dienste" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Eigene Dienste (z.B. Fahrer, Kuchen, Aufbau)</h2>
        <p className="text-sm text-muted-foreground">
          Zusätzlich zu Ordner, Kioskdienst, Kassierer und Zeitnehmer/Sekretär könnt ihr eigene Dienste anlegen, die es nur bei
          euch gibt. Sie werden genauso besetzt wie die anderen: Ein Spiel gilt erst als vollständig, wenn auch die eigenen
          Dienste ihren Bedarf erreichen, und offene Plätze stehen unter „Offene Dienste“ und im Kalender.
        </p>
        <h3 className="text-sm font-medium">Anlegen</h3>
        <p className="text-sm text-muted-foreground">
          Unter{" "}
          <Link href="/admin/einstellungen#eigene-dienste" className="font-medium underline">
            Einstellungen → Dienste → „Eigenen Dienst anlegen“
          </Link>{" "}
          legt der Vereinsadmin je Dienst fest (die Einstellungen sind dieselben wie bei den festen Diensten,{" "}
          <a href="#bedarf" className="font-medium underline">siehe oben</a>):
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Name</strong> und optional einen <strong>Hinweis für die Helfer</strong> (steht in der Mail, z.B. „Treffpunkt 30
            Minuten vor Abfahrt an der Halle“).
          </li>
          <li>
            <strong>Personen je Termin</strong> für Heimspiel, Auswärtsspiel, Freundschaftsspiel und Turnier (0 = dort nicht).
          </li>
          <li>
            <strong>Mannschaften:</strong> alle oder nur ausgewählte, z.B. Fahrer nur für die Jugend.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Ein Dienst, für den schon jemand eingeteilt wurde, lässt sich nur noch <strong>deaktivieren</strong>, nicht löschen: Die
          Einteilungen bleiben sichtbar, es entsteht aber kein neuer Bedarf mehr.
        </p>
        <h3 className="text-sm font-medium">Auswärtsspiele (z.B. Fahrer)</h3>
        <p className="text-sm text-muted-foreground">
          Hat ein eigener Dienst Bedarf bei <strong>Auswärtsspielen</strong> <em>oder</em> ist für die Mannschaft ein{" "}
          <strong>Trainer</strong> hinterlegt (Funktionsträger mit Rolle Trainer), legt HandballerPate die Auswärtsspiele dieser
          Mannschaften automatisch aus dem Spielplan als Termine an. So sehen Trainer auch die Auswärtsspiele ihrer Mannschaft im
          Profil und im persönlichen Kalender; ohne Dienst und ohne Trainer werden keine Auswärtsspiele geladen (feste Dienste wie
          Ordner gibt es dort nicht). Im
          Kalender stehen sie mit <strong>Auto-Symbol</strong> und gestricheltem Rahmen, damit man sie von den Heimspielen
          unterscheidet, und wie die anderen mit „Vollständig“/„Offen“ für die eigenen Dienste. Wird ein Auswärtsspiel{" "}
          <strong>verlegt</strong>, werden die Einteilungen aufgehoben und die Eingeteilten bekommen eine Mail (sie tragen sich zum
          neuen Termin neu ein); wird es <strong>abgesagt</strong>, entfällt der Termin, ebenfalls mit Mail. Auch die Trainer der
          Mannschaft bekommen bei Verlegung oder Absage eine Info-Mail. Ändert sich nur die Halle,
          wird sie still angepasst und die Einteilungen bleiben. Voraussetzung ist die angebundene Vereins-ID (Spielplan).
        </p>
        <h3 className="text-sm font-medium">Einteilen: der Dienstwart</h3>
        <p className="text-sm text-muted-foreground">
          Eingeteilt wird auf der Seite <strong>Dienstwart</strong> (im Admin-Bereich unter „Dienste“, Abschnitt „Dienste einteilen“, im Profil über die
          Schaltfläche „Dienstwart“ bzw. unten „Dienste“). Dort arbeiten alle Vereinsadmins und Personen mit der Rolle{" "}
          <strong>„Dienstwart (eigene Dienste)“</strong>, die ihr unter Funktionsträger vergebt. Je Termin seht ihr alle geltenden
          eigenen Dienste mit „eingeteilt / gebraucht“ und könnt
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            eine <strong>Person des Vereins</strong> auswählen (sie bekommt eine Mail) oder einen <strong>Namen ohne Login</strong>{" "}
            eintragen, z.B. für ein Elternteil ohne Konto,
          </li>
          <li>Einteilungen wieder entfernen,</li>
          <li>
            mit <strong>„Bedarf anpassen“</strong> für genau diesen Termin mehr oder weniger Personen anfordern (0 = hier nicht
            gebraucht, leer = wieder der Standard).
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Anders als bei den festen Diensten braucht für eigene Dienste niemand eine eigene Rolle: Einteilen lässt sich jede Person
          des Vereins. Wird ein Spiel verlegt, werden die Einteilungen wie bei den anderen Helferdiensten aufgehoben und die
          Betroffenen informiert.
        </p>
        <h3 className="text-sm font-medium">Selbst eintragen lassen</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            Auf der Dienstwart-Seite unter <strong>„Öffentliche Selbsteintragung“</strong> den Link aktivieren und z.B. in die
            Elterngruppe teilen. Es ist dieselbe Eintragungsseite wie für Zeitnehmer und Ordner (
            <a href="#selbsteintragung" className="font-medium underline">mehr dazu</a>); eure eigenen Dienste stehen dort
            zusätzlich zur Auswahl.
          </li>
          <li>
            Ein Eintrag zählt <strong>sofort</strong>, eine Bestätigung durch den Wart ist nicht nötig. Wer im Verein ein Konto hat,
            wird über die E-Mail (oder weil er eingeloggt ist) erkannt und bekommt eine Bestätigung; sonst wird der Name ohne Login
            eingetragen. Ein Konto wird dabei nicht angelegt.
          </li>
          <li>
            <strong>Abmelden:</strong> Personen mit Konto sehen ihre Einsätze im Profil unter „Meine Helferdienste“ und fragen dort
            die Abmeldung an. Der Dienstwart bekommt eine Mail (gibt es keinen, die Vereinsadmins) und bestätigt oder lehnt auf
            seiner Seite unter „Abmeldeanfragen“ ab.
          </li>
          <li>
            Unter <strong>Auswertung &amp; Export</strong> stehen eure eigenen Dienste in einer eigenen Spalte („Fahrer: Eva, Opa
            Heinz (2/3); Kuchen: offen“), auch in Excel und PDF. In der Statistik zählen sie als Einsätze.
          </li>
        </ul>
        <h3 id="fahrgemeinschaft" className="scroll-mt-6 text-sm font-medium">Fahrgemeinschaft (Plätze je Auto, wer fährt wen)</h3>
        <p className="text-sm text-muted-foreground">
          Bei einem eigenen Dienst wie „Fahrer“ setzt ihr unter{" "}
          <Link href="/admin/einstellungen#eigene-dienste" className="font-medium underline">
            Einstellungen → Dienste
          </Link>{" "}
          das Häkchen <strong>„Fahrgemeinschaft“</strong>. Dann läuft es fast von allein über den Eintragungslink (Dienstwart-Seite →
          „Öffentliche Selbsteintragung“, z.B. in die Elterngruppe teilen):
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Fahrer</strong> wählen „Fahrer“, tippen die Spiele an und geben dabei gleich ihre <strong>freien Plätze</strong>{" "}
            (ohne sich selbst, 0 bis 8) und optional einen <strong>Treffpunkt</strong> an.
          </li>
          <li>
            <strong>Mitfahrer</strong> (bzw. die Eltern für ihr Kind) tragen sich auf derselben Seite unten unter{" "}
            <strong>„Mitfahren“</strong> selbst ein: beim gewünschten Fahrer den Namen eingeben, „Mitfahren“ tippen. Kein Konto nötig.
            Es geht nur, solange Plätze frei sind; der Fahrer bekommt eine kurze Mail (wenn er ein Konto hat).
          </li>
          <li>
            <strong>Ändern:</strong> Der Fahrer sieht seine Mitfahrer im Profil unter „Meine Helferdienste“ und kann dort Plätze,
            Treffpunkt und Mitfahrer ändern; der Dienstwart bzw. Admin ebenso auf der Dienstwart-Seite (z.B. für Fahrer ohne Login oder
            wenn jemand absagt).
          </li>
          <li>
            <strong>Übersicht:</strong> Die Dienstwart-Seite zeigt je Termin „Mitfahrplätze frei: n“, der Kalender beim Fahrer
            Plätze, Treffpunkt und Mitfahrer, der Export „Eva (+2 Mitfahrer)“.
          </li>
          <li>
            <strong>Datenschutz:</strong> Auf der öffentlichen Eintragungsseite steht nur die Zahl der freien Plätze je Fahrer, nie
            die Namen der Mitfahrer.
          </li>
          <li>
            Wird der Fahrer ausgetragen oder das Spiel verlegt (die Einteilung entfällt dann), sind auch seine Mitfahrer wieder
            frei und müssen neu zugeteilt werden.
          </li>
        </ul>
      </section>

      <section id="warte" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Die Wart-Seiten: wo, was, wer</h2>
        <p className="text-sm text-muted-foreground">
          Eingeteilt wird auf den Wart-Seiten, je eine für Schiedsrichter, Zeitnehmer/Sekretär und Ordner/Kioskdienst/Kassierer,
          dazu eine für die <a href="#eigene-dienste" className="font-medium underline">eigenen Dienste</a> (Dienstwart, z.B.
          Fahrer oder Kuchen). Hat euer Verein noch keine eigenen Dienste, verweist die Dienstwart-Seite auf Einstellungen → Dienste.
        </p>
        <h3 className="text-sm font-medium">„So legst du los“: die Starthilfe oben</h3>
        <p className="text-sm text-muted-foreground">
          Auf jeder Wart-Seite steht ganz oben eine kurze Karte mit den Schritten, mit denen es losgeht (z.B. Personen anlegen, Eintragungslink
          teilen, ersten Termin besetzen) und einem Tipp. Die Haken setzen sich von selbst, sobald etwas erledigt ist; die Karte verschwindet,
          wenn alles geschafft ist. Mit „Ausblenden“ bleibt sie auf diesem Gerät weg. Wer nicht Admin ist, sieht nur Schritte, die er selbst
          erledigen kann; das Anlegen von Personen oder Diensten macht der Vereinsadmin.
        </p>
        <h3 className="text-sm font-medium">Wer sieht sie?</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Vereinsadmins</strong> sehen alle vier, auch ohne eigene Wart-Rolle.
          </li>
          <li>
            <strong>Warte:</strong> Der Admin gibt einer Person unter{" "}
            <Link href="/admin/funktionstraeger" className="font-medium underline">
              Funktionsträger
            </Link>{" "}
            die Rolle Schiedsrichterwart, Zeitnehmerwart, Ordnerwart oder Dienstwart. Die Person sieht dann nur „ihre“ Wart-Seite und
            braucht keine Admin-Rechte.
          </li>
          <li>Admins „nur lesend“ und alle anderen Funktionsträger sehen die Wart-Seiten nicht.</li>
        </ul>
        <h3 className="text-sm font-medium">Wie komme ich hin?</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Im Admin-Bereich:</strong> am Computer oben im Menü <strong>„Dienste“</strong> (Abschnitt „Dienste einteilen“), am Handy unten
            unter <strong>„Mehr“ → Dienste einteilen</strong> (ein Abschnitt der Gruppe „Dienste“).
          </li>
          <li>
            <strong>Im Profil:</strong> oben die Schaltflächen „Schiedsrichterwart“, „Zeitnehmerwart“, „Ordnerwart“ und
            „Dienstwart“, am Handy zusätzlich unten in der Leiste („Schiris“, „Zeitnehmer“, „Ordner“, „Dienste“). So kommen auch
            Warte ohne Admin-Rechte hin.
          </li>
        </ul>
        <h3 className="text-sm font-medium">Was steht darauf?</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Öffentliche Selbsteintragung</strong> (Zeitnehmer- und Ordnerwart): den login-freien Link aktivieren,
            teilen, neu erzeugen oder abschalten (<a href="#selbsteintragung" className="font-medium underline">mehr dazu</a>).
          </li>
          <li>
            <strong>Bedarf pro Mannschaft:</strong> für Mannschaften ohne eigene Helfer (z.B. manche Jugend) den Bedarf ganz
            abschalten. Das ist derselbe Schalter wie die Mannschaftsauswahl unter{" "}
            <a href="#bedarf" className="font-medium underline">Einstellungen → Dienste</a>.
          </li>
          <li>
            <strong>Selbsteintragungen zum Bestätigen:</strong> Einträge über den öffentlichen Link, deren Name keiner
            angelegten Person sicher zugeordnet werden konnte. Vorschlag prüfen und bestätigen, eine vorhandene Person wählen
            oder neu anlegen.
          </li>
          <li>
            <strong>Abmeldeanfragen:</strong> Personen, die doch nicht können (<a href="#abmeldungen" className="font-medium underline">mehr dazu</a>).
          </li>
          <li>
            <strong>Personen im Verein</strong> mit der Zahl ihrer bisherigen Einsätze, wer oben steht, war am seltensten dran.
          </li>
          <li>
            <strong>Termine</strong> („x offen von y“): je Termin Personen zuordnen, ersetzen oder entfernen; der Bedarf eines
            einzelnen Termins lässt sich anpassen. Die Auswahl zeigt nur Personen, die zu dem Zeitpunkt nicht schon woanders
            eingeteilt sind.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Die Seite des <strong>Schiedsrichterwarts</strong> ist schlanker: Schiedsrichter im Verein mit ihren Einsätzen und die
          Termine ohne Verbands-Schiedsrichter (Freundschaftsspiele, Turniere), für die der Verein selbst pfeift. Eine
          öffentliche Selbsteintragung gibt es für Schiedsrichter nicht.
        </p>
      </section>

      <section id="zuordnung" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Dienste verteilen &amp; Selbsteintragung</h2>
        <p className="text-sm text-muted-foreground">Es gibt drei Wege, wie eine Person zu einem Dienst kommt:</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Der Wart teilt ein:</strong> auf seiner Wart-Seite bei einem Termin eine angelegte Person auswählen. Ohne
            HandballerPate-Konto geht <strong>„Ohne Login zuordnen“</strong>, dafür reicht ein Name.
          </li>
          <li>
            <strong>Funktionsträger tragen sich selbst ein:</strong> wer eingeloggt ist, sieht im Profil unter „Offene Dienste“
            die Termine für seine Rollen und trägt sich mit einem Tipp ein.
          </li>
          <li>
            <strong>Öffentliche Selbsteintragung ohne Login</strong> (Zeitnehmer/Sekretär, Ordner, Kioskdienst, Kassierer),
            siehe unten.
          </li>
        </ol>

        <h3 id="selbsteintragung" className="scroll-mt-6 text-sm font-medium">
          Öffentliche Selbsteintragung (Link für Eltern und Helfer)
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Mit oder ohne Zugang:</strong> Wer nicht angemeldet ist, wählt oben auf der Seite zwischen <strong>„Mit Zugang“</strong>{" "}
            (Login-Link per E-Mail, danach geht es ohne erneutes Tippen weiter) und <strong>„Ohne Zugang“</strong> (nur Namen angeben,
            die E-Mail ist optional). Umschalten geht ohne Neuladen; es ist immer nur ein Weg sichtbar.
          </li>
          <li>
            <strong>Freischalten:</strong> Der Zeitnehmerwart schaltet auf seiner Seite unter „Öffentliche Selbsteintragung“
            den Teil für Zeitnehmer/Sekretär frei, der Ordnerwart den Teil für Ordner, Kioskdienst und Kassierer.
          </li>
          <li>
            <strong>Eine Seite für alles:</strong> Beide Links führen auf dieselbe Eintragungsseite (<code>/eintragen/…</code>).
            Angeboten wird, was gerade freigeschaltet ist und wofür es einen anstehenden Termin mit Bedarf gibt. Ist z.B. nur
            der Ordner-Teil aktiv, sieht man nur Ordner, Kioskdienst und Kassierer. Ältere Links (
            <code>/zeitnehmer-eintragen/…</code>, <code>/ordner-eintragen/…</code>) funktionieren weiter und leiten dorthin
            um.
          </li>
          <li>
            <strong>Teilen:</strong> Unter dem Link gibt es „Kopieren“, „Teilen“ (am Handy) und „Per WhatsApp teilen“, z.B.
            für die Elterngruppe eines Kaders.
          </li>
          <li>
            <strong>Eintragen:</strong> oben nach Mannschaft filtern, Termine antippen, bei Zeitnehmer/Sekretär die Aufgabe
            wählen, Namen eingeben. Die E-Mail ist freiwillig, aber empfohlen: damit bekommt die Person Erinnerungen und ein
            Konto. Wer im Verein schon eingeloggt ist, muss nichts eintippen; alternativ gibt es auf der Seite einen
            Login-Link per Mail.
          </li>
          <li>
            <strong>Prüfen:</strong> Der Name wird mit den angelegten Funktionsträgern abgeglichen. Ist er eindeutig, zählt der
            Eintrag sofort. Sonst landet er beim zuständigen Wart unter „Selbsteintragungen zum Bestätigen“ (auch auf der
            Übersicht im Admin-Bereich).
          </li>
          <li>
            <strong>Neuer Link / abschalten:</strong> „Link neu generieren“ macht den alten Link ungültig (z.B. wenn er in
            falsche Hände geraten ist), „Deaktivieren“ schaltet die Eintragung ganz ab. Bereits eingetragene Dienste bleiben.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Für Schiedsrichter gibt es keine öffentliche Selbsteintragung: bei Ligaspielen setzt der Verband an, sonst teilt der
          Schiedsrichterwart ein. Jede Zuordnung kann der zuständige Wart jederzeit wieder entfernen oder ersetzen.{" "}
          <strong>Trainer</strong> haben einen eigenen Eintragungslink je Mannschaft (siehe{" "}
          <a href="#funktionstraeger" className="font-medium underline">Funktionsträger</a>).
        </p>
      </section>

      <section id="abmeldungen" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Wenn jemand doch nicht kann</h2>
        <p className="text-sm text-muted-foreground">
          Wer eingetragen ist, kann sich in seinem Profil bei dem Termin <strong>abmelden</strong>. Das ist eine Anfrage, keine
          sofortige Austragung: der zuständige Wart bekommt eine Mail, und die Anfrage steht auf seiner Wart-Seite und auf der
          Übersicht im Admin-Bereich. Dort wird sie <strong>genehmigt</strong> (der Platz wird wieder frei und taucht in den
          offenen Diensten auf) oder <strong>abgelehnt</strong>. Bis dahin bleibt die Person eingetragen und kann die Anfrage
          selbst zurückziehen.
        </p>
      </section>
      <section id="mails" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">E-Mails &amp; Erinnerungen</h2>
        <p className="text-sm text-muted-foreground">
          HandballerPate schickt Erinnerungen vor unbesetzten Diensten, auslaufenden Lizenzen und anstehenden Terminen sowie eine
          Wochenübersicht (eure Einsätze, dazu die Trainings der Woche und Vereinstermine, die ihr sehen dürft; sie kommt nur, wenn es Einsätze, Vereinstermine oder ein ausfallendes Training gibt), und informiert bei Verlegungen: Wird ein Ligaspiel verlegt, bekommen die dafür eingetragenen Schiedsrichter und die Trainer der Mannschaft eine Info-Mail, Zeitnehmer, Ordner und andere Dienste werden ausgetragen und benachrichtigt. Jede Person stellt im Profil-Menü unter <strong>Benachrichtigungen</strong> ein,
          welche optionalen Mails sie bekommt. Jede dieser Mails hat unten einen <strong>Abbestellen-Link</strong> (auch Gmail und
          Outlook zeigen „Abbestellen“). Trainer bekommen außerdem eine Mail, wenn irgendwo im Verein ein Training ausfällt und die Halle frei wird (<a href="#training" className="font-medium underline">Training</a>); zu Sitzungen u.ä. gibt es Einladungen (<a href="#vereinstermine" className="font-medium underline">Vereinstermine</a>). Der Admin legt in den Einstellungen fest, welche Mail-Arten der Verein überhaupt
          verschickt. <strong>Admins</strong> bekommen zusätzlich Hinweise zu Spielplan-Änderungen (Verlegungen, neue Ergebnisse), offenen Diensten und ablaufenden Lizenzen; jeder Admin schaltet sie für sich im Profil unter <strong>Benachrichtigungen</strong> („Hinweise für Admins“) oder per Abbestellen-Link ab, die anderen Admins bekommen sie weiter. Login-Links, Verlegungen an eingetragene Personen und Zahlungsmails sind nicht abbestellbar.
        </p>
      </section>

      <section id="statistik" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Statistik &amp; offene Dienste</h2>
        <p className="text-sm text-muted-foreground">
          Unter <strong>Dienste → Offene Dienste</strong> steht, was noch zu besetzen ist (ein Spiel mit mehreren offenen Rollen
          zählt einmal). Unter <strong>Auswertung → Statistik</strong> seht ihr die Bilanz aller Mannschaften über alle Spiele (Heim
          und Auswärts; laufende Spiele zählen erst mit dem endgültigen Ergebnis), darunter je Mannschaft eine Karte mit Form, Tore pro Spiel, Heim/Auswärts,
          höchstem Sieg und Halbzeit-Auswertung, und die Top-Dienstleistenden. Dieselbe Mannschaftsstatistik sehen Spieler und Eltern
          in der öffentlichen App im Reiter „Statistik“.
        </p>
      </section>

      <section id="auswertung" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Auswertung &amp; Export</h2>
        <p className="text-sm text-muted-foreground">
          Unter{" "}
          <Link href="/admin/auswertung" className="font-medium underline">
            Auswertung &amp; Export
          </Link>{" "}
          steht der gesamte Dienstplan mit allen besetzten Rollen, filterbar nach Zeitraum. Einzelne Termine und Rollen lassen
          sich auswählen und als <strong>Excel</strong> oder <strong>PDF</strong> herunterladen, z.B. zum Aushang in der Halle.
        </p>
      </section>

      <section id="trainingsplan" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Trainingsplan</h2>
        <p className="text-sm text-muted-foreground">
          Unter{" "}
          <Link href="/admin/trainingsplan" className="font-medium underline">
            Spielbetrieb → Trainingsplan
          </Link>{" "}
          plant ihr die wöchentlich wiederkehrenden Trainingszeiten je Halle: am Computer per Ziehen (Mannschaft auf einen
          Wochentag ziehen, Dauer an der unteren Kante anpassen), am Handy über „Bearbeiten“. Unterteilte Hallen haben eine
          Spalte je Abteil; Überschneidungen werden rot markiert. Der Plan gilt für jede Woche gleich und hat keinen Einfluss
          auf Spiele und Dienste.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Plätze und Saison (z.B. Beachhandball):</strong> Mit „+ Halle / Platz“ legt ihr auch einen <strong>Platz</strong> an, etwa einen Beachplatz. Für einen
          Ort lässt sich eine <strong>Saison</strong> einstellen (z.B. Mai bis September, auch über den Jahreswechsel möglich): Trainings dort gibt es nur in diesen
          Monaten, der Wochenplan bleibt unverändert. Im Kalender, unter „Training“ und bei Ausfällen erscheinen sie nur in der Saison, ein Ausfall sagt dann
          „Platz frei“. Ohne Saison gilt der Ort ganzjährig.
        </p>
      </section>

      <section id="training" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Training: Ausfälle &amp; freie Hallenzeiten</h2>
        <p className="text-sm text-muted-foreground">
          Unter{" "}
          <Link href="/profil/training" className="font-medium underline">
            Training
          </Link>{" "}
          (im Kalender über „Zum Training“ und im Menü „Mehr“) stehen die Trainings der nächsten zwei Wochen aus dem Trainingsplan. Fällt ein
          Training einmal aus, meldet das ein <strong>Admin</strong> oder ein <strong>Trainer dieser Mannschaft</strong> mit
          „Fällt aus“ (Grund optional). Der Plan selbst bleibt unverändert; nur dieser Termin gilt als ausgefallen, die Halle ist in
          der Zeit frei und steht oben unter <strong>Freie Hallenzeiten</strong>. „Findet doch statt“ nimmt die Meldung zurück.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Frei gewordene Zeit belegen:</strong> Bei jeder freien Zeit (oben unter „Freie Hallenzeiten“ und in der Liste) steht ein Button{" "}
          <strong>„Zeit belegen“</strong>. Er öffnet ein Fenster, in dem ihr eure Mannschaft wählt (Trainer: die eigenen, Admins: jede andere) und optional eine Notiz
          schreibt. <strong>Wer zuerst bucht, bekommt die Zeit</strong>; eine Freigabe ist nicht nötig. Die ausfallende Mannschaft (Trainer) und die Admins bekommen
          eine Mail. Wer gebucht hat (oder ein Admin), kann die Belegung mit „Belegung aufheben“ wieder lösen, dann erfahren es alle Trainer. Solange die Zeit belegt
          ist, kann die ausfallende Mannschaft den Ausfall nicht zurücknehmen; das entscheidet ein Admin (die Belegung entfällt dann, die buchende Mannschaft wird
          informiert). Im Kalender steht „belegt von …“ am ausgefallenen Training.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Wer erfährt es?</strong> Alle Trainer des Vereins bekommen eine Info-Mail (auch bei der Rücknahme), außer der
          meldenden Person. Jeder Trainer kann das im Profil-Menü unter <strong>Benachrichtigungen</strong> („Hinweis, wenn ein
          Training ausfällt und die Halle frei wird“) oder über den Abbestellen-Link in der Mail abschalten.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Wer sieht „Training“?</strong> Admins und Trainer immer. Der Admin kann den Punkt unter{" "}
          <Link href="/admin/einstellungen#training" className="font-medium underline">
            Einstellungen → Training
          </Link>{" "}
          für alle Personen im Verein einschalten (Standard: aus). Für die <strong>öffentliche App</strong> (Spieler, Eltern, Fans) gibt es einen eigenen Schalter.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Training in der öffentlichen App:</strong> Unter Einstellungen → Training lässt sich „Training in der öffentlichen App zeigen“ einschalten (Standard:
          aus, nur mit öffentlicher Vereinsseite). Dann erscheint dort der Reiter <strong>Training</strong> mit den Trainings der nächsten zwei Wochen (Mannschaft, Uhrzeit,
          Ort), filterbar nach Gruppe und Favoriten; ausfallende Trainings sind durchgestrichen. <strong>Nie öffentlich</strong> sind der Grund eines Ausfalls, Notizen,
          Buchungen frei gewordener Zeiten und Trainernamen. Orte mit Saison (z.B. Beachplatz) erscheinen nur in der Saison. Die Hilfe für Fans steht unter{" "}
          <Link href="/app-hilfe#training" className="font-medium underline">
            App-Hilfe → Training
          </Link>
          .
        </p>
      </section>

      <section id="vereinstermine" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Vereinstermine (Sitzungen) mit Zu- und Absage</h2>
        <p className="text-sm text-muted-foreground">
          Für Sitzungen, Versammlungen, Arbeitseinsätze und andere Termine, die keine Spiele sind. Der Admin schaltet die Funktion unter{" "}
          <Link href="/admin/einstellungen#vereinstermine" className="font-medium underline">
            Einstellungen → Vereinstermine
          </Link>{" "}
          ein (Standard: aus); danach gibt es im Admin-Menü <strong>Verein → Vereinstermine</strong>; alle sehen ihre Termine im Kalender und im Profil unter „Mehr“ →
          „Vereinstermine“.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Wer sieht einen Termin?</strong> Das stellt ihr je Termin ein: <em>Alle im Verein</em>, <em>Nur Vereinsadmins</em> oder eine{" "}
          <em>Auswahl</em> nach Rolle (Trainer, Schiedsrichter, Zeitnehmer/Sekretär, Ordner, Kioskdienst, Kassierer, Warte) und/oder einzelnen
          Personen. Vereinsadmins sehen jeden Vereinstermin. Auf der öffentlichen Vereinsseite erscheint nichts davon.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Zu- und Absage:</strong> Wer einen Termin sehen darf, kann bis zum Beginn mit <em>Zusagen</em>, <em>Vielleicht</em> oder{" "}
          <em>Absagen</em> antworten (optional mit kurzer Notiz) und die Antwort ändern oder zurücknehmen. Auf der Profilseite erinnert eine Karte an
          offene Rückmeldungen. Wer geantwortet hat, sehen nur die Vereinsadmins (Übersicht je Termin, auch wer noch offen ist); alle anderen sehen
          nur die Zahlen. Ohne Haken bei „Um Rückmeldung bitten“ gibt es keine Antwort-Abfrage.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Wiederholungen:</strong> Beim Anlegen lässt sich ein Rhythmus wählen (jede Woche, alle 2 Wochen oder jeden Monat am gleichen Wochentag, z.B. jeden 4.
          Donnerstag) und ein Enddatum („wiederholen bis“, höchstens 52 Termine). Jeder Termin der Serie ist ein eigener Termin mit eigenen Zu- und Absagen; die
          Eingeladenen bekommen nur <strong>eine</strong> Mail für die ganze Serie, und im Profil sehen sie von einer Serie die nächsten drei Termine. Beim Bearbeiten
          gilt eine Änderung nur für diesen Termin, oder mit „Auch alle folgenden Termine ändern“ ab diesem Termin (die Tage bleiben, Uhrzeit, Ort, Titel und
          Sichtbarkeit werden übernommen). Löschen geht für „nur diesen Termin“ oder „diesen und alle folgenden“.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Mails:</strong> Beim Anlegen kann der Admin die Eingeladenen per Mail informieren („Eingeladene per Mail informieren“). Bei einer Änderung
          von Titel, Beginn, Ende oder Ort bekommen sie eine Änderungsmail, neu Hinzugekommene eine Einladung; wird ein Termin gelöscht, bekommen alle, die
          zugesagt oder „vielleicht“ geantwortet haben, eine Absage. Jede Person kann diese Mails im Profil unter <strong>Benachrichtigungen</strong> oder per
          Abmelde-Link abschalten. Die Termine stehen auch im persönlichen <a href="#ics-feed" className="font-medium underline">Kalender-Abo</a>.
        </p>
      </section>

      <section id="kosten" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Beta, Kosten &amp; Verein löschen</h2>
        <p className="text-sm text-muted-foreground">
          Während der Beta-Phase (bis 30.11.2026) ist HandballerPate kostenlos. Was danach gilt (Preis, Rechnung, Fristen),
          steht unter{" "}
          <Link href="/admin/einstellungen#vereinsdaten" className="font-medium underline">
            Einstellungen → Vereinsdaten und Rechnung
          </Link>
          ; dort pflegt ihr auch Rechnungsadresse und Rechnungs-E-Mail. Vor dem Ende der Beta bekommt der Vereinsadmin eine
          Mail mit den Konditionen. Optional kann ein <strong>Sponsor</strong> die Kosten übernehmen (Einstellungen →
          Sponsor).
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>14 Tage kostenlos testen:</strong> Registriert sich ein Verein, wenn alle Beta-Plätze vergeben sind oder die Beta
          vorbei ist, ist er die ersten 14 Tage kostenlos und ohne Zahlungsdaten dabei. Im Admin-Bereich steht oben, bis wann die
          Testphase läuft. Danach ist der Zugang gesperrt (die Daten bleiben). Wer weitermachen möchte, meldet sich als Vereinsadmin an und klickt
          „Ich möchte HandballerPate weiterhin nutzen“ — dort stehen die Konditionen. Erst damit entsteht die Rechnung (per E-Mail, Zahlungsziel 30 Tage);
          automatisch zahlt niemand. Wer nicht weitermachen möchte, tut nichts oder löscht den Verein unter Einstellungen → Gefahrenzone.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>Aussteigen:</strong> Unter Einstellungen → Gefahrenzone → „Verein löschen“ wird der Verein mit allen
          Personen, Mannschaften, Terminen und der Historie endgültig gelöscht. Vor dem Ende der Beta fallen dann keine
          Kosten an.
        </p>
      </section>

      <section id="support" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Support, Feedback, Datenschutz</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Frage oder Fehler?</strong> Über den <strong>Feedback-Button</strong> im Kopf der Seite erreicht ihr uns direkt.
          </li>
          <li>
            <strong>Support-Zugriff:</strong> Standardmäßig kommt niemand vom HandballerPate-Support in euren Verein. Der Admin kann
            unter Einstellungen → Support-Zugriff eine befristete oder dauerhafte Freigabe erteilen und jederzeit widerrufen. Jeder
            Zugriff wird protokolliert.
          </li>
          <li>
            <strong>Datenschutz:</strong> Eure Daten sind je Verein getrennt. Auftragsverarbeitungsvertrag und Datenschutzerklärung
            findet ihr unter Einstellungen → Rechtliches bzw. im Fußbereich. Die öffentliche Vereinsseite zeigt nur öffentliche Sportdaten, keine
            Personen.
          </li>
          <li>
            <strong>Darstellung:</strong> Hell, Dunkel oder automatisch stellt ihr unten auf jeder Seite ein.
          </li>
        </ul>
      </section>
    </main>
  );
}
