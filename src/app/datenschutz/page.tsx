import Link from "next/link";

export const metadata = { title: "Datenschutzerklärung – HandballerPate" };

export default function DatenschutzPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/login" className="text-sm text-muted-foreground underline">
          ← Zurück zum Login
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-semibold">
        Datenschutzerklärung
      </h1>

      <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
        Diese Erklärung beschreibt die tatsächlich eingesetzten technischen
        Dienste (Stand dieser Version) und ist automatisiert erstellt — sie
        ersetzt keine rechtliche Prüfung. Bitte vor produktivem Einsatz von
        einem Anwalt bzw. Datenschutzbeauftragten gegenprüfen lassen.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Verantwortlicher</h2>
        <p className="text-sm text-muted-foreground">
          Verantwortlich für die Datenverarbeitung ist der Betreiber dieser
          Anwendung, siehe{" "}
          <Link href="/impressum" className="underline">
            Impressum
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Welche Daten werden verarbeitet?
        </h2>
        <p className="text-sm text-muted-foreground">
          Im Rahmen der Vereinsverwaltung verarbeiten wir folgende Daten von
          Funktionsträgern (Schiedsrichter, Zeitnehmer, Sekretäre, Ordner,
          Kioskdienst, Trainer, Admins):
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Name, E-Mail-Adresse, optional Telefonnummer</li>
          <li>Rolle(n) im Verein und Zuordnung zu Terminen/Einsätzen</li>
          <li>
            Login-Daten: Session-Cookie zur Authentifizierung, bei
            Passwort-Login ein Passwort-Hash (das Passwort selbst wird nicht
            im Klartext gespeichert)
          </li>
          <li>
            Bei aktivierten Push-Benachrichtigungen: die vom Browser
            vergebene Push-Abonnement-Adresse
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Zweck der Verarbeitung
        </h2>
        <p className="text-sm text-muted-foreground">
          Die Daten werden ausschließlich zur Organisation des
          Vereinsbetriebs verarbeitet: Planung und Zuordnung von Einsätzen
          (z.B. Schiedsrichter-Ansetzungen), Versand von Terminerinnerungen
          per E-Mail bzw. Push-Benachrichtigung, und zur Anmeldung
          (Authentifizierung).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Rechtsgrundlage</h2>
        <p className="text-sm text-muted-foreground">
          Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b
          DSGVO (Erfüllung der vereinsinternen Organisation gegenüber
          Mitgliedern/Funktionsträgern) bzw. Art. 6 Abs. 1 lit. f DSGVO
          (berechtigtes Interesse an einem funktionierenden
          Vereinsspielbetrieb).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Eingesetzte Dienste (Auftragsverarbeitung/Hosting)
        </h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Vercel Inc.</strong> — Hosting der Webanwendung.
          </li>
          <li>
            <strong>Neon</strong> — Hosting der Datenbank (Postgres).
          </li>
          <li>
            <strong>E-Mail-Versand</strong> über einen vom Verein
            konfigurierten SMTP-Anbieter, für Login-Links und
            Benachrichtigungen.
          </li>
          <li>
            <strong>Web-Push</strong> (sofern aktiviert) — läuft über die
            Push-Infrastruktur des jeweiligen Browsers/Betriebssystems
            (z.B. Google, Mozilla, Apple).
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Es werden keine Analyse- oder Tracking-Dienste eingesetzt.
        </p>
        <p className="text-sm text-muted-foreground">
          Einzelne Dienste können Daten außerhalb der EU verarbeiten
          (Drittlandtransfer) — hierfür gelten deren jeweilige
          Datenschutz-Garantien (z.B. EU-Standardvertragsklauseln).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Cookies</h2>
        <p className="text-sm text-muted-foreground">
          Es wird ausschließlich ein technisch notwendiges Session-Cookie
          zur Anmeldung gesetzt. Es werden keine Tracking- oder
          Marketing-Cookies verwendet.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Speicherdauer</h2>
        <p className="text-sm text-muted-foreground">
          Daten werden gespeichert, solange die Funktionsträger-Rolle bzw.
          der Zugang besteht. Auf Anfrage werden Daten gelöscht, soweit dem
          keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Deine Rechte</h2>
        <p className="text-sm text-muted-foreground">
          Du hast das Recht auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch gegen die Verarbeitung deiner Daten sowie das Recht,
          dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Wende
          dich dafür an die im{" "}
          <Link href="/impressum" className="underline">
            Impressum
          </Link>{" "}
          genannte Kontaktadresse.
        </p>
      </section>
    </main>
  );
}
