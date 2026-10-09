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
            ["oeffentliche-seite", "Öffentliche Vereinsseite & App"],
            ["kalender", "Kalender & Besetzung"],
            ["bedarf", "Dienste-Bedarf festlegen"],
            ["zuordnung", "Funktionsträger zuordnen"],
            ["ics-feed", "Persönlicher Kalender (ICS-Feed)"],
            ["mails", "E-Mails & Erinnerungen"],
            ["statistik", "Statistik & offene Dienste"],
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
          In dieser Reihenfolge ist euer Verein in wenigen Minuten startklar. Der Systemadmin sieht ebenfalls, welche Punkte
          noch fehlen.
        </p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Anmelden und AVV bestätigen:</strong> Der Vereinsadmin meldet sich per E-Mail-Link oder Passwort an und
            bestätigt beim ersten Login den Auftragsverarbeitungsvertrag (<strong>/admin/avv</strong>).
          </li>
          <li>
            <strong>Mannschaften anlegen:</strong> unter <strong>Verwaltung → Mannschaften</strong> (bei Anbindung der
            Liga-Daten, siehe Schritt 5, erkennt HandballerPate die Mannschaften größtenteils selbst).
          </li>
          <li>
            <strong>Funktionsträger anlegen:</strong> unter <strong>Verwaltung → Funktionsträger</strong> einzeln oder per
            Excel-Import: Schiedsrichter, Zeitnehmer, Sekretär, Ordner, Kioskdienst, Kassierer, Trainer. Wer sich selbst
            einloggen soll, braucht eine E-Mail-Adresse. Wer mehrere Aufgaben hat, bekommt mehrere Rollen.
          </li>
          <li>
            <strong>Dienste-Bedarf festlegen:</strong> unter <strong>Einstellungen → Dienste-Bedarf pro Termin</strong>, wie
            viele Ordner, Kioskdienste, Kassierer und Zeitnehmer/Sekretär je Veranstaltung gebraucht werden (siehe unten). Ein
            Spiel gilt nur als <strong>vollständig besetzt</strong>, wenn auch diese Dienste ihren Bedarf erreichen.
          </li>
          <li>
            <strong>Spielplan anbinden:</strong> unter <strong>Einstellungen → Öffentliche Vereinsseite</strong> die
            nuLiga- und/oder handball.net-Vereins-ID eintragen (siehe unten). Danach kommen Termine, Verlegungen, Ergebnisse
            und Ansetzungen automatisch, tagsüber stündlich.
          </li>
          <li>
            <strong>Aufgaben verteilen:</strong> die Warte (Schiedsrichter-, Zeitnehmer-, Ordnerwart) ordnen auf ihrer
            Profil-Seite zu, oder ihr aktiviert die login-freie Selbsteintragung (siehe unten). Im <strong>Kalender</strong>{" "}
            seht ihr, welche Spiele vollständig besetzt sind. Tage mit offener Besetzung sind am Handy mit einem
            Warnsymbol markiert.
          </li>
          <li>
            <strong>Vereinsseite und App teilen:</strong> Logo und Farbe festlegen, dann den Link zu eurer Seite an Spieler,
            Eltern und Fans geben. Sie können die Seite als App installieren.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          <strong>Darstellung:</strong> Unten auf jeder Seite stellt ihr „Automatisch“ (folgt dem Handy), „Hell“ oder „Dunkel“
          ein. Die Statistik (Bilanz aller Spiele, Top-Dienstleistende) findet ihr unter{" "}
          <strong>Verwaltung → Statistik</strong>, offene Aufgaben unter <strong>Offene Dienste</strong>.
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
            <strong>Warte (Schiedsrichter-, Zeitnehmer-, Ordnerwart):</strong> ordnen auf ihrer Profil-Seite Personen zu den
            Terminen zu und verwalten ihre Selbsteintragungs-Links.
          </li>
          <li>
            <strong>Alle anderen Funktionsträger</strong> (Schiedsrichter, Zeitnehmer, Sekretär, Ordner, Kioskdienst, Kassierer,
            Trainer): sehen im Profil ihre eigenen Einsätze, offene Dienste und ihren persönlichen Kalender.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Eine Person kann mehrere Rollen haben. Wer den Verein verlässt, wird deaktiviert, seine bisherigen Einsätze bleiben in der
          Historie.
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
          Tabelle. Spieler, Eltern und Fans finden sie in der Vereinssuche auf
          der Startseite, können Mannschaften auf ihrem Handy merken und die
          Seite als App installieren. Es werden nur öffentliche Sportdaten
          übernommen, keine Personen.
        </p>

        <h3 className="text-sm font-medium">1. Einrichten</h3>
        <p className="text-sm text-muted-foreground">
          Unter <strong>Einstellungen → Öffentliche Vereinsseite</strong> tragt
          ihr die Vereins-ID eurer Quelle ein und klickt auf{" "}
          <strong>Speichern &amp; Seite erstellen</strong>. Beide Quellen lassen
          sich kombinieren, dann stehen alle Mannschaften zusammen auf einer Seite:
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
          Spielbericht angelegt hat. Während ein Spiel läuft, zeigt die Karte „Live“ und „Läuft gerade“ statt einer Zahl,
          danach „Ergebnis folgt“: Zwischenstände zeigen wir bewusst nicht als Ergebnis. Das Endergebnis erscheint, sobald
          nuLiga den Spielbericht genehmigt hat (bis dahin mit „vorläufig“). Die Daten werden stündlich aktualisiert, den
          aktuellen Spielstand liefert der Live-Ticker.
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
          HandballerPate bleiben davon unberührt.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Brauche ich noch eine Hallen-ID?
        </h2>
        <p className="text-sm text-muted-foreground">
          In der Regel <strong>nein</strong>. Spielplan, Verlegungen,
          Ergebnisse und die Ansetzung der Schiedsrichter kommen tagsüber stündlich
          aus den öffentlichen Liga-Daten, und dafür genügt die
          nuLiga- bzw. handball.net-Vereins-ID unter{" "}
          <strong>Einstellungen → Öffentliche Vereinsseite</strong> — Heim-
          und Auswärtsspiele gleichermaßen.
        </p>
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
          Ausnahme: <strong>Freundschaftsspiele und Turniere</strong> stehen
          nicht in den öffentlichen Liga-Daten. Bis wir sie ebenfalls
          automatisch pflegen (in Entwicklung), müssen sie von Hand als
          Termin angelegt werden. Solange euer Verein noch den
          Hallenplan-Import nutzt (<strong>Einstellungen →
          Hallenplan-Import</strong>), kommen sie weiter über die Hallen-ID;
          die Umstellung nehmen wir je Verein vor.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Wann brauche ich eine handball.net-Team-ID?
        </h2>
        <p className="text-sm text-muted-foreground">
          Ab der 3. Liga (und z.B. Jugend-Bundesliga) läuft der
          Spielbetrieb zentral über handball.net statt über die
          Landesverbands-nuLiga — dort gibt es keine Hallen-, sondern nur
          eine Mannschafts-Abfrage. Deshalb tragt ihr bei den betroffenen
          Mannschaften (<strong>Mannschaften → Mannschaft bearbeiten</strong>)
          stattdessen die handball.net-Team-ID ein (aus der URL der
          Team-Seite, z.B. bei handball.net/team/69770 die 69770).
        </p>
        <p className="text-sm text-muted-foreground">
          Da handball.net pro Mannschaft abgefragt wird,{" "}
          <strong>deckt dieser Import ALLE Spiele der Mannschaft ab</strong>{" "}
          — Heim- und Auswärtsspiele gleichermaßen, anders als bei der
          Hallen-ID oben.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Ändert sich das mit Handball360?
        </h2>
        <p className="text-sm text-muted-foreground">
          Der DHB stellt den Spielbetrieb schrittweise auf ein neues,
          bundesweit einheitliches Verbandsmanagementsystem namens{" "}
          <strong>Handball360</strong> um, das nuLiga und Handball4all
          ablöst. Auch der HHV plant den Umstieg. Sobald das feststeht und
          sich die Datenquelle ändert, passen wir den automatischen Import
          entsprechend an — die Unterscheidung Vereins-ID/Team-ID oben gilt
          also nur, solange nuLiga bzw. handball.net im Einsatz sind.
        </p>
      </section>

      <section id="kalender" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Kalender &amp; Besetzung</h2>
        <p className="text-sm text-muted-foreground">
          Im <strong>Kalender</strong> seht ihr alle Termine des Vereins. Ein Spiel zeigt <strong>„Vollständig“</strong> (grün,
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
          Wie wird der Bedarf pro Rolle festgelegt?
        </h2>
        <p className="text-sm text-muted-foreground">
          Für eigene Veranstaltungen — Freundschaftsspiel, Turnier und
          Rundenspiel — legt ihr unter{" "}
          <strong>Einstellungen → Dienste-Bedarf pro Termin</strong> fest,
          wie viele Ordner, Kioskdienst-, Kassierer- und Zeitnehmer/
          Sekretär-Helfer ihr braucht. Der Bedarf gilt getrennt je
          Veranstaltungsart, ein Turnier braucht in der Regel mehr Helfer als
          ein normales Rundenspiel. Zeitnehmer und Sekretär haben dabei immer
          genau einen Platz pro Termin, Ordner/Kioskdienst/Kassierer können je
          nach eingetragenem Bedarf auch mehrfach besetzt werden. Ein Spiel
          zählt im Kalender und im Dashboard erst als <strong>vollständig
          besetzt</strong>, wenn Zeitnehmer/Sekretär <em>und</em> alle so
          festgelegten Helferdienste (Ordner, Kioskdienst, Kassierer) ihren
          Bedarf erreichen; ein Bedarf von 0 oder eine abgeschaltete Mannschaft
          zählt nicht.
        </p>
        <p className="text-sm text-muted-foreground">
          Braucht eine einzelne Mannschaft grundsätzlich keinen eigenen
          Helfer (z.B. manche Jugend-Mannschaften ohne eigenes Publikum),
          lässt sich der Bedarf pro Rolle und Mannschaft auf den
          Wart-Seiten (<strong>Zeitnehmerwart</strong> bzw.{" "}
          <strong>Ordnerwart</strong>, Abschnitt „Bedarf pro Mannschaft“)
          komplett abschalten — das wirkt auf alle Termine dieser
          Mannschaft, auch bereits bestehende offene. Für einzelne Termine
          lässt sich der Zeitnehmer/Sekretär-Bedarf zusätzlich individuell
          überschreiben, z.B. wenn bei einem persönlichen
          Schiedsrichter-Einsatz (ICS-Feed, siehe oben) ausnahmsweise doch
          ein Zeitnehmer mitfahren soll.
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

      <section id="zuordnung" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">
          Wie werden Funktionsträger einem Termin zugeordnet?
        </h2>
        <p className="text-sm text-muted-foreground">
          Es gibt zwei Wege, jemanden einem Termin zuzuordnen:
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>1. Manuell durch den zuständigen Wart:</strong> Der
          Schiedsrichterwart, Zeitnehmerwart bzw. Ordnerwart wählt auf seiner
          Profil-Seite bei jedem offenen Termin eine bereits angelegte
          Person aus einem Dropdown aus. Hat die Person (noch) keinen
          eigenen HandballerPate-Account, funktioniert{" "}
          <strong>„Ohne Login zuordnen“</strong> als Fallback — dafür reicht
          ein Name, ganz ohne Account.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>2. Öffentliche Selbsteintragung:</strong> Zeitnehmerwart
          und Ordnerwart können auf ihrer jeweiligen Seite unter{" "}
          <strong>„Öffentliche Selbsteintragung“</strong> einen login-freien
          Link aktivieren. Beide führen auf dieselbe Seite{" "}
          <code className="text-xs">/eintragen/…</code> — angeboten werden
          genau die Dienste, die die Warte freigeschaltet haben (Zeitnehmer/
          Sekretär, Ordner, Kioskdienst, Kassierer); die älteren Adressen{" "}
          <code className="text-xs">/zeitnehmer-eintragen/…</code> und{" "}
          <code className="text-xs">/ordner-eintragen/…</code> leiten dorthin
          weiter. Diesen Link
          teilt ihr z.B. mit den Eltern eines Kaders; dort wählt jede Person
          selbst aus den Terminen ihrer Mannschaft und trägt sich (nur mit
          Namen, ganz ohne HandballerPate-Login) direkt ein. Der Name wird
          automatisch mit bereits angelegten Funktionsträgern abgeglichen;
          bei Unsicherheit landet der Eintrag beim zuständigen Wart zur
          Bestätigung, bevor er als endgültige Zuordnung zählt.
        </p>
        <p className="text-sm text-muted-foreground">
          Für Schiedsrichter gibt es keine öffentliche Selbsteintragung —
          die Zuordnung läuft ausschließlich über den Schiedsrichterwart
          bzw. kommt für echte Ligaspiele direkt vom Verband (siehe oben).
          Jede Zuordnung lässt sich vom zuständigen Wart jederzeit wieder
          entfernen oder ersetzen (Umbesetzung), z.B. wenn jemand
          kurzfristig ausfällt.
        </p>
      </section>
      <section id="mails" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">E-Mails &amp; Erinnerungen</h2>
        <p className="text-sm text-muted-foreground">
          HandballerPate schickt Erinnerungen vor unbesetzten Diensten, auslaufenden Lizenzen und anstehenden Terminen sowie eine
          Wochenübersicht, und informiert bei Verlegungen. Jede Person stellt im Profil-Menü unter <strong>Benachrichtigungen</strong> ein,
          welche optionalen Mails sie bekommt. Jede dieser Mails hat unten einen <strong>Abbestellen-Link</strong> (auch Gmail und
          Outlook zeigen „Abbestellen“). Der Admin legt in den Einstellungen fest, welche Mail-Arten der Verein überhaupt
          verschickt. Login-Links, Verlegungen und Systemmails sind nicht abbestellbar.
        </p>
      </section>

      <section id="statistik" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Statistik &amp; offene Dienste</h2>
        <p className="text-sm text-muted-foreground">
          Unter <strong>Verwaltung → Offene Dienste</strong> steht, was noch zu besetzen ist (ein Spiel mit mehreren offenen Rollen
          zählt einmal). Unter <strong>Verwaltung → Statistik</strong> seht ihr die Bilanz aller Mannschaften über alle Spiele (Heim
          und Auswärts; laufende Spiele zählen erst mit dem endgültigen Ergebnis), darunter je Mannschaft eine Karte mit Form, Tore pro Spiel, Heim/Auswärts,
          höchstem Sieg und Halbzeit-Auswertung, und die Top-Dienstleistenden. Dieselbe Mannschaftsstatistik sehen Spieler und Eltern
          in der öffentlichen App im Reiter „Statistik“.
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
