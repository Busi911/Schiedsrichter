import Link from "next/link";
import { ZurueckButton } from "@/components/zurueck-button";

export const metadata = {
  title: "Hilfe zur App für Spieler, Eltern und Fans – HandballerPate",
  description:
    "So findet ihr euren Verein, installiert die App aufs Handy, merkt Favoriten und versteht Live, Ergebnis folgt und vorläufig.",
};

// Öffentlich (ohne Login, siehe publicRoutes in src/proxy.ts): die Hilfe für Besucher der Vereinsseiten. Die Hilfe für
// Funktionsträger/Admins liegt getrennt unter /hilfe (nur eingeloggt).
export default function AppHilfePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <ZurueckButton fallbackHref="/" />
      </div>
      <h1 className="font-heading text-2xl font-semibold">Hilfe zur App</h1>
      <p className="text-sm text-muted-foreground">
        Für Spieler, Eltern und Fans: Spielplan, Ergebnisse, Tabellen und Live-Ticker eures Vereins, ohne Anmeldung.
      </p>

      <nav aria-label="Inhalt" className="rounded-lg border bg-muted/30 p-4">
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {[
            ["finden", "Verein und Mannschaft finden"],
            ["installieren", "App aufs Handy installieren"],
            ["favoriten", "Favoriten merken"],
            ["statistik", "Statistik"],
            ["spiele", "Live, Ergebnis folgt, vorläufig"],
            ["daten", "Woher kommen die Daten?"],
            ["problem", "Etwas fehlt oder stimmt nicht"],
          ].map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="finden" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Verein und Mannschaft finden</h2>
        <p className="text-sm text-muted-foreground">
          Auf der <Link href="/#vereine" className="underline">Startseite</Link> oder unter{" "}
          <Link href="/verein" className="underline">Alle Vereine</Link> euren Verein suchen und antippen. Dort seht ihr die
          letzten Ergebnisse, die nächsten Spiele und alle Mannschaften mit Tabelle und Spielplan. Unten gibt es eine Leiste zum
          Wechseln zwischen <strong>Ergebnisse</strong>, <strong>Spiele</strong> und <strong>Teams</strong>.
        </p>
      </section>

      <section id="installieren" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">App aufs Handy installieren</h2>
        <p className="text-sm text-muted-foreground">
          Jeder Verein ist eine eigene App mit Namen, Farbe und Logo des Vereins. Eine Installation aus dem App Store ist nicht
          nötig:
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>iPhone (Safari):</strong> auf das Teilen-Symbol tippen, dann <strong>„Zum Home-Bildschirm“</strong>.
          </li>
          <li>
            <strong>Android (Chrome):</strong> Menü (drei Punkte), dann <strong>„App installieren“</strong> oder{" "}
            <strong>„Zum Startbildschirm hinzufügen“</strong>.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          In der installierten App bleiben eure Favoriten zuverlässiger gespeichert (Safari löscht Webseiten-Daten nach längerer
          Pause).
        </p>
      </section>

      <section id="favoriten" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Favoriten merken</h2>
        <p className="text-sm text-muted-foreground">
          Mit dem <strong>Stern</strong> merkt ihr euch Mannschaften oder einen ganzen Verein. Unter{" "}
          <Link href="/meine" className="underline">Meine Mannschaften</Link> seht ihr dann alle Favoriten mit ihren nächsten
          Spielen und Ergebnissen auf einen Blick. Die Favoriten liegen nur auf eurem Gerät, es gibt kein Konto und keine
          Anmeldung. Auf einem anderen Gerät müsst ihr sie neu setzen.
        </p>
      </section>

      <section id="statistik" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Statistik</h2>
        <p className="text-sm text-muted-foreground">
          Im Reiter <strong>Statistik</strong> seht ihr je Mannschaft die Bilanz, Siegquote, Tore (gesamt und pro Spiel),
          Heim und Auswärts, die Formkurve der letzten 5 Spiele, den <strong>Saisonverlauf</strong> (Punkte nach jedem Spiel),
          höchsten Sieg, torreichstes Spiel und, soweit der Verband sie liefert, die Halbzeit-Auswertung. Unter{" "}
          <strong>Duelle</strong> steht je Gegner Hin- und Rückspiel (ohne Ergebnis mit dem Datum des Spiels). Oben auf der
          Seite Ergebnisse zeigt „Diese Woche in Zahlen“, wie viele Spiele des Vereins diese Woche anstehen und wie sie
          bisher ausgegangen sind. Laufende Spiele zählen erst mit dem endgültigen Ergebnis, Nichtantritte gar nicht.
          Eine Tabelle mit Platzverlauf gibt es nicht: Wir kennen nur die Spiele unseres Vereins, nicht die der ganzen Staffel.
        </p>
      </section>

      <section id="spiele" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Live, Ergebnis folgt, vorläufig</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Live-Ticker:</strong> rund um ein Spiel gibt es einen Link zum Live-Ticker bei nuLiga mit dem aktuellen Stand.
            Er erscheint, sobald der Verband den Spielbericht angelegt hat.
          </li>
          <li>
            <strong>Live / Läuft gerade:</strong> Das Spiel läuft vermutlich. Wir zeigen bewusst keine Zwischenstände als
            Ergebnis, damit niemand einen Spielstand für das Endergebnis hält. Den aktuellen Stand zeigt der Live-Ticker.
          </li>
          <li>
            <strong>Ergebnis folgt:</strong> Das Spiel ist vermutlich vorbei, das Ergebnis ist noch nicht vom Verband bestätigt.
          </li>
          <li>
            <strong>vorläufig:</strong> Ein Ergebnis steht schon, ist aber noch nicht endgültig genehmigt. Es kann sich noch
            ändern.
          </li>
          <li>
            <strong>Spielbericht:</strong> Der Link zum offiziellen Spielbericht erscheint, sobald das Ergebnis feststeht.
          </li>
          <li>
            <strong>Verlegt / Abgesagt:</strong> Solche Spiele sind mit einem Hinweis gekennzeichnet.
          </li>
        </ul>
      </section>

      <section id="daten" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Woher kommen die Daten?</h2>
        <p className="text-sm text-muted-foreground">
          Spielplan, Tabellen und Ergebnisse kommen aus den öffentlichen Daten von nuLiga (Landesverband) und handball.net (DHB,
          z.B. 3. Liga und Jugendbundesliga). Wir übernehmen nur öffentliche Sportdaten, keine Personen. Die Daten werden tagsüber
          etwa stündlich aktualisiert, am Spieltag kann es deshalb etwas dauern, bis ein Ergebnis erscheint. Unten auf jeder Seite
          stellt ihr Hell, Dunkel oder automatisch ein.
        </p>
      </section>

      <section id="problem" className="flex flex-col gap-2 scroll-mt-6">
        <h2 className="font-heading text-lg font-medium">Etwas fehlt oder stimmt nicht</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Eine Mannschaft oder ein Spiel fehlt:</strong> Der Verband hat den Spielplan vielleicht noch nicht
            veröffentlicht, oder die Mannschaft ist (noch) keiner Staffel zugeteilt. Sprecht den Verein an; er kann die Anbindung
            prüfen.
          </li>
          <li>
            <strong>Ein Ergebnis ist falsch:</strong> Wir zeigen, was der Verband veröffentlicht. Eine Korrektur muss dort erfolgen,
            sie kommt dann automatisch bei uns an.
          </li>
          <li>
            <strong>Euer Verein hat noch keine Seite:</strong> Der Verein kann sich kostenlos auf der{" "}
            <Link href="/registrieren" className="underline">Startseite registrieren</Link>.
          </li>
        </ul>
      </section>
    </main>
  );
}
