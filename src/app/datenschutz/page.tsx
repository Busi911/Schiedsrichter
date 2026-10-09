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
            Lizenzdaten (Gültigkeit), Zeitpunkt des letzten Logins und der
            letzten Aktivität sowie persönliche Benachrichtigungs-Einstellungen
            und ein persönlicher Kalender-Link
          </li>
          <li>
            Bei Vereinsadmins: Ansprechpartner, Rechnungs-E-Mail und
            Anschrift des Vereins für die Rechnung
          </li>
          <li>Freitext-Rückmeldungen, die du über „Feedback“ sendest</li>
          <li>
            Namen von Schiedsrichtern und Zeitnehmern, wenn ein Verein
            Ansetzungen aus dem Spielbetrieb in seine privaten Termine
            übernimmt (nur sichtbar für den jeweiligen Verein)
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
          per E-Mail, und zur Anmeldung
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
            <strong>E-Mail-Versand</strong> über einen vom Betreiber
            eingesetzten SMTP-Anbieter, für Login-Links und
            Benachrichtigungen.
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
        <h2 className="font-heading text-lg font-medium">
          Öffentliche Vereins- und Mannschaftsseiten
        </h2>
        <p className="text-sm">
          Vereine können eine öffentliche Seite mit Mannschaften, Spielplänen,
          Ergebnissen und Tabellen freischalten (/verein/…). Die Sportdaten
          stammen aus dem öffentlichen Spielbetrieb: den Landesverbänden
          (nuLiga, z.B. Hessischer Handball-Verband), dem Deutschen
          Handballbund (handball.net, ab der 3. Liga) und, für die 1. und
          2. Handball-Bundesliga, aus den Ergebnisseiten des NDR. Sie werden
          regelmäßig abgeglichen. Übernommen werden nur Vereine, Mannschaften,
          Wettbewerbe, Termine, Spielorte, Ergebnisse und Tabellen —
          keine Mannschaftsverantwortlichen, Schiedsrichter oder sonstigen
          Personen. Der Besuch dieser Seiten erfordert kein Konto. Vereine und
          Mannschaften lassen sich als Favoriten markieren; das geschieht ohne
          Konto nur in deinem Browser (siehe Cookies) und wird nicht in einer
          Datenbank beim Betreiber gespeichert.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Zugriffsdaten beim Besuch der Seiten
        </h2>
        <p className="text-sm text-muted-foreground">
          Beim Aufruf der Anwendung — auch der öffentlichen Vereins- und
          Mannschaftsseiten ohne Konto — verarbeitet der Hosting-Anbieter
          technisch notwendige Zugriffsdaten (u.a. IP-Adresse, Zeitpunkt,
          aufgerufene Adresse, Browser-Angaben) in Server-Protokollen, um die
          Seiten auszuliefern, Fehler zu erkennen und Missbrauch abzuwehren.
          Wir werten diese Daten nicht zur Profilbildung oder zu
          Werbezwecken aus. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
          (berechtigtes Interesse am sicheren und stabilen Betrieb).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Zugriff durch den Betreiber (Einrichtung und Support)
        </h2>
        <p className="text-sm text-muted-foreground">
          Der Betreiber kann einen Verein auf dessen Wunsch im Vorbereitungs-Modus
          einrichten. Der Verein ist dabei nicht öffentlich sichtbar, es werden keine
          E-Mails versendet. Mit der Übergabe an den Vereinsadmin endet dieser Zugriff
          vollständig. Danach kann der Betreiber nur auf die Vereinsdaten zugreifen,
          wenn der Vereinsadmin den Support-Zugriff ausdrücklich freigibt — befristet
          (1, 3 oder 7 Tage) oder auf eigenen Wunsch dauerhaft bis zum Widerruf; er kann
          die Freigabe jederzeit widerrufen. Übergabe, Freigaben und
          Zugriffe werden im Verein protokolliert und sind dort einsehbar.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Sponsorenbild auf den öffentlichen Vereinsseiten</h2>
        <p className="text-sm text-muted-foreground">
          Auf der öffentlichen Seite eines Vereins kann kurz das Bild eines Sponsors erscheinen
          („Präsentiert von …“), der die technischen Kosten übernimmt. Dabei werden keine Daten über dich
          erhoben oder an den Sponsor übermittelt; lediglich in deinem Browser wird lokal vermerkt, dass das
          Bild heute schon gezeigt wurde. Tippst du auf das Bild, öffnet sich die Webseite des Sponsors, für
          die dessen Datenschutzhinweise gelten.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Cookies</h2>
        <p className="text-sm text-muted-foreground">
          Es wird ausschließlich ein technisch notwendiges Session-Cookie
          zur Anmeldung gesetzt. Wer auf den öffentlichen Vereinsseiten
          Favoriten merkt (ohne Konto), dem wird zusätzlich ein technisch
          notwendiges Cookie gesetzt, das nur die öffentlichen IDs der
          gemerkten Vereine und Mannschaften enthält (bis zu 12 Monate), damit
          die Favoriten auch dann erhalten bleiben, wenn der Browser seinen
          lokalen Speicher bereinigt. Es werden keine Tracking- oder
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
