import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { AVV_VERSION } from "@/lib/avv";
import { avvAkzeptieren } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { formatDatumZeit } from "@/lib/format";

export const metadata = { title: "Auftragsverarbeitungsvertrag – HandballerPate" };

// Bewusst auth() statt requireAdmin(): diese Seite muss auch dann
// erreichbar sein, wenn noch nicht zugestimmt wurde — requireAdmin()
// würde sonst genau hierher zurückschicken (Schleife, siehe Kommentar bei
// erzwingeAvvZustimmungFallsNoetig in lib/session.ts). Nach erteilter
// Zustimmung bleibt die Seite als Nachschlagewerk erreichbar (siehe Link
// von /admin/einstellungen), zeigt dann nur den Text plus Zustimmungs-Datum
// statt des Formulars.
export default async function AvvPage() {
  const session = await auth();
  if (!session?.user?.vereinId) redirect("/login");
  if (!session.user.istAdmin && !session.user.istAdminLesend) {
    redirect("/profil");
  }

  const vereinId = session.user.vereinId;
  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );
  const vereinName = verein?.name ?? "dem Verein";
  const bereitsAkzeptiert = !!verein?.avvAkzeptiertAm;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div>
        {/* Diese Seite liegt bewusst AUSSERHALB von admin/(dashboard)/layout.tsx
            (siehe Kommentar oben) und hat deshalb keine geerbte Navigation
            mehr — hier daher ein eigener Link zurück, nur sinnvoll klickbar
            wenn die Zustimmung schon erteilt ist (sonst liefe man gegen den
            AVV-Zwang in requireAdmin() erneut hierher zurück). */}
        {bereitsAkzeptiert && (
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline"
          >
            ← Zurück zum Admin-Bereich
          </Link>
        )}
        <h1 className="font-heading text-2xl font-semibold">
          Auftragsverarbeitungsvertrag (AVV)
        </h1>
        <p className="text-sm text-muted-foreground">
          nach Art. 28 DSGVO zwischen {vereinName} (Verantwortlicher) und der
          DeWe Consulting UG (haftungsbeschränkt) als Betreiberin von
          HandballerPate (Auftragsverarbeiterin).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 pt-6 text-sm text-muted-foreground">
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 1 Gegenstand und Dauer
            </h2>
            <p>
              Die Auftragsverarbeiterin verarbeitet für den Verantwortlichen
              personenbezogene Daten im Rahmen der Nutzung der
              Verwaltungsplattform HandballerPate (Planung und Zuordnung von
              Funktionsträger-Einsätzen, Terminverwaltung, Benachrichtigungen).
              Der Vertrag beginnt mit der Zustimmung unten und läuft für die
              Dauer der Nutzung von HandballerPate durch den Verantwortlichen.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 2 Art, Umfang und Zweck der Verarbeitung
            </h2>
            <p>Verarbeitete Datenkategorien:</p>
            <ul className="list-disc pl-5">
              <li>Name, E-Mail-Adresse, optional Telefonnummer</li>
              <li>Rolle(n) im Verein, Lizenzdaten (Gültigkeit) und Zuordnung zu Terminen/Einsätzen</li>
              <li>
                Login-Daten (Session, Passwort-Hash bei Passwort-Login),
                Zeitpunkt des letzten Logins und der letzten Aktivität
              </li>
              <li>
                persönlicher Kalender-Link (Token) und persönliche
                Benachrichtigungs-Einstellungen
              </li>
              <li>
                Rechnungsdaten des Vereins: Ansprechpartner, Rechnungs-E-Mail
                und Anschrift
              </li>
              <li>Freitext-Rückmeldungen (Feedback) an die Betreiberin</li>
              <li>
                Namen von Schiedsrichtern und Zeitnehmern, soweit der Verein
                Ansetzungen aus dem Spielbetrieb (nuLiga, handball.net) in
                seine privaten Termine übernimmt
              </li>
            </ul>
            <p>
              Betroffene: Funktionsträger des Verantwortlichen (Schiedsrichter,
              Zeitnehmer, Sekretäre, Ordner, Kioskdienst, Kassierer, Trainer,
              Admins) sowie die vom Verein benannten Ansprechpartner für die
              Rechnung und die in Ansetzungen genannten Schiedsrichter und
              Zeitnehmer. Zweck: Organisation des Vereinsspielbetriebs, siehe{" "}
              <Link href="/datenschutz" className="underline">
                Datenschutzerklärung
              </Link>
              .
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 3 Weisungsgebundenheit
            </h2>
            <p>
              Die Auftragsverarbeiterin verarbeitet personenbezogene Daten
              ausschließlich im Rahmen der getroffenen Vereinbarungen und/oder
              nach dokumentierter Weisung des Verantwortlichen, es sei denn,
              sie ist durch das Recht der Europäischen Union oder der
              Mitgliedstaaten zu einer anderweitigen Verarbeitung verpflichtet.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 4 Pflichten der Auftragsverarbeiterin
            </h2>
            <ul className="list-disc pl-5">
              <li>
                Vertraulichkeit: zum Zugriff berechtigte Personen sind auf
                Vertraulichkeit verpflichtet.
              </li>
              <li>
                Technische und organisatorische Maßnahmen gemäß Art. 32
                DSGVO (siehe Anlage TOM unten).
              </li>
              <li>
                Unterstützung des Verantwortlichen bei der Erfüllung von
                Betroffenenrechten (Auskunft, Berichtigung, Löschung u.a.)
                sowie bei der Einhaltung der in Art. 32–36 DSGVO genannten
                Pflichten.
              </li>
              <li>
                Meldung von Verletzungen des Schutzes personenbezogener
                Daten an den Verantwortlichen unverzüglich nach
                Bekanntwerden.
              </li>
              <li>
                Löschung oder Rückgabe aller personenbezogenen Daten nach
                Beendigung der Nutzung, sofern keine gesetzliche
                Aufbewahrungspflicht entgegensteht.
              </li>
              <li>
                Nachweis der Einhaltung der in diesem Vertrag geregelten
                Pflichten gegenüber dem Verantwortlichen auf Anfrage.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 5 Unterauftragsverarbeiter
            </h2>
            <p>Aktuell eingesetzt (siehe Datenschutzerklärung für Details):</p>
            <ul className="list-disc pl-5">
              <li>Vercel Inc. — Hosting der Webanwendung</li>
              <li>Neon — Hosting der Datenbank (Postgres, EU-Region)</li>
              <li>
                der von der Auftragsverarbeiterin eingesetzte SMTP-Anbieter
                für den E-Mail-Versand (Login-Links, Erinnerungen,
                Benachrichtigungen)
              </li>
            </ul>
            <p>
              Öffentliche Sportdaten (nuLiga, handball.net, NDR) werden von
              der Auftragsverarbeiterin abgerufen, die Anbieter erhalten
              dabei keine Daten des Verantwortlichen und sind keine
              Unterauftragsverarbeiter.
            </p>
            <p>
              Die Auftragsverarbeiterin unterrichtet den Verantwortlichen
              über beabsichtigte Änderungen in Bezug auf die Hinzuziehung
              oder Ersetzung weiterer Unterauftragsverarbeiter, sodass der
              Verantwortliche Gelegenheit hat, dagegen Einspruch zu erheben.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 6 Kontrollrechte des Verantwortlichen
            </h2>
            <p>
              Der Verantwortliche hat das Recht, sich vor Beginn und
              während der Verarbeitung von der Einhaltung der in diesem
              Vertrag getroffenen Regelungen zu überzeugen, z.B. durch
              Einholung von Auskünften.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              § 7 Zugriff durch die Auftragsverarbeiterin (Einrichtung und Support)
            </h2>
            <p>
              Auf Wunsch des Verantwortlichen richtet die
              Auftragsverarbeiterin den Verein im Vorbereitungs-Modus ein
              (nicht öffentlich sichtbar, ohne E-Mail-Versand); mit der
              Übergabe an den Vereinsadmin endet dieser Zugriff vollständig.
              Danach greift sie auf die Daten des Verantwortlichen nur zu,
              wenn dieser den Support-Zugriff ausdrücklich freigibt
              (befristet auf 1, 3 oder 7 Tage oder auf eigenen Wunsch
              dauerhaft bis zum Widerruf). Die Freigabe kann jederzeit
              widerrufen werden. Übergabe, Freigaben und Zugriffe werden
              protokolliert und sind für den Verantwortlichen einsehbar.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-base font-medium text-foreground">
              Anlage: Technische und organisatorische Maßnahmen (Art. 32 DSGVO)
            </h2>
            <ul className="list-disc pl-5">
              <li>Verschlüsselte Übertragung (TLS) für alle Verbindungen</li>
              <li>
                Zugangsschutz per Login (Passwort-Hashing mit scrypt bzw.
                Magic-Link)
              </li>
              <li>
                Mandantentrennung auf Datenbankebene (Row-Level-Security je
                Verein)
              </li>
              <li>
                Zugriff der Auftragsverarbeiterin auf Vereinsdaten nur im
                Rahmen von Einrichtung oder freigegebenem Support, mit
                Protokollierung
              </li>
              <li>Hosting bei Vercel/Neon mit deren jeweiligen TOM</li>
            </ul>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zustimmung</CardTitle>
          <CardDescription>
            {bereitsAkzeptiert
              ? `Akzeptiert am ${formatDatumZeit(verein!.avvAkzeptiertAm!)} von ${verein?.avvAkzeptiertVonName} (${verein?.avvAkzeptiertVonEmail}), Fassung ${verein?.avvAkzeptiertVersion}.`
              : "Erforderlich, um HandballerPate als Vereinsadmin nutzen zu können."}
          </CardDescription>
        </CardHeader>
        {!bereitsAkzeptiert && session.user.istAdmin && (
          <CardContent>
            <form action={avvAkzeptieren} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                Mit dem Klick stimmst du als {vereinName} der Fassung{" "}
                {AVV_VERSION} zu.
              </p>
              <SubmitButton className="w-full">Zustimmen</SubmitButton>
            </form>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
