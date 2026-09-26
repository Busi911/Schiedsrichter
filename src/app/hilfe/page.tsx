import Link from "next/link";

export const metadata = {
  title: "Hilfe: Hallen-ID, Team-ID & Schiedsrichter-Kalender – HandballerPate",
};

export default function HilfePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link href="/login" className="text-sm text-muted-foreground underline">
          ← Zurück zum Login
        </Link>
      </div>

      <h1 className="font-heading text-2xl font-semibold">
        Hilfe: Hallen-ID, Team-ID &amp; Schiedsrichter-Kalender
      </h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">
          Wann brauche ich eine Hallen-ID?
        </h2>
        <p className="text-sm text-muted-foreground">
          Bis zur 3. Liga läuft der Spielbetrieb über die
          (Landesverbands-)nuLiga-Instanz, organisiert pro Halle. Trägt
          euer Verein unter <strong>Einstellungen → nuLiga Automatischer
          Import</strong> die Hallen-ID(s) ein, importiert HandballerPate
          automatisch den Hallenspielplan.
        </p>
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-400">
          Wichtige Einschränkung: Der Hallenspielplan-Import über die
          Hallen-ID deckt <strong>nur Spiele ab, die in der eigenen Halle
          stattfinden</strong> — Auswärtsspiele der eigenen Mannschaften
          tauchen darüber NICHT auf. Technisch ist das aktuell nicht anders
          lösbar, da nuLiga den Spielplan hallenweise, nicht
          mannschaftsweise anbietet.
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
          entsprechend an — die Unterscheidung Hallen-ID/Team-ID oben gilt
          also nur, solange nuLiga bzw. handball.net im Einsatz sind.
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
    </main>
  );
}
