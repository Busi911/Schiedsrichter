import Link from "next/link";
import { CalendarCheckIcon, ClipboardListIcon, HeartHandshakeIcon, UsersIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ABLAUF_NACH_BETA, NETTO } from "@/lib/beta-konditionen";
import { DEMO_TOKEN_ORDNER } from "@/lib/demo-konstanten";
import { demoStarten } from "./actions";

export const metadata = {
  title: "Demo ausprobieren – HandballerPate",
  description: "HandballerPate mit Testdaten ausprobieren: Einteilung der Ehrenamtlichen (Zeitnehmer, Kiosk, Ordner, Kasse), ohne Anmeldung.",
  robots: { index: false, follow: false },
};

// Öffentlich (publicRoutes in src/proxy.ts), bewusst nicht indexiert: der Link geht gezielt an Vereine, die sich die Verwaltung ansehen wollen.
export default function DemoPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Logo className="size-10" />
        <Link href="/" className="font-heading text-lg font-semibold">
          HandballerPate
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold">Einfach ausprobieren</h1>
        <p className="text-base text-muted-foreground">
          Hier seht ihr die Verwaltung eines Beispielvereins — vor allem die <strong className="text-foreground">Einteilung der Ehrenamtlichen</strong>:
          Zeitnehmer, Sekretäre, Ordner, Kioskdienst und Kasse für die Heimspiele. Ihr könnt <strong className="text-foreground">alles benutzen</strong>:
          Personen zuteilen, Termine ändern, Bedarf anpassen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demo starten</CardTitle>
          <CardDescription>Ohne Anmeldung, ohne Konto. Ihr arbeitet als Vereinsadmin des Beispielvereins „HSG Musterstadt“.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form action={demoStarten}>
            <SubmitButton className="h-12 w-full text-base" pendingText="Demo wird vorbereitet…">
              Demo öffnen
            </SubmitButton>
          </form>
          <p className="text-sm text-muted-foreground">
            Alle Daten sind erfunden und werden <strong>jede Nacht zurückgesetzt</strong>. Es werden keine E-Mails verschickt. Einige Funktionen, die nach
            außen wirken (z.B. Daten beim Verband abrufen), sind in der Demo gesperrt.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Was ihr ausprobieren könnt</h2>
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <CalendarCheckIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Kalender und offene Dienste:</strong> auf einen Blick, welche Spiele vollständig besetzt sind und wo noch jemand fehlt.
            </span>
          </li>
          <li className="flex gap-3">
            <UsersIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Zuordnen:</strong> unter „Profil“ die Bereiche Zeitnehmerwart und Ordnerwart öffnen und Personen den Spielen zuteilen.
              Dort warten auch Selbsteintragungen und eine Abmeldeanfrage auf eine Entscheidung.
            </span>
          </li>
          <li className="flex gap-3">
            <ClipboardListIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <strong className="text-foreground">Bedarf festlegen:</strong> in den Einstellungen, wie viele Ordner, Kiosk- und Kassendienste je Veranstaltung gebraucht werden — und je Spiel anpassen.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">So sehen es Eltern und Helfer</h2>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <HeartHandshakeIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            Eltern und Helfer brauchen kein Konto: Sie öffnen einen Link, wählen ihre Spiele und tragen sich ein.{" "}
            <Link href={`/eintragen/${DEMO_TOKEN_ORDNER}`} className="underline">
              Die Eintragungsseite der Demo ansehen
            </Link>{" "}
            — wer sich dort einträgt, erscheint in der Demo beim Wart zur Bestätigung.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-medium">Beta und Kosten</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {ABLAUF_NACH_BETA.map((punkt) => (
            <li key={punkt}>{punkt}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{NETTO}</p>
      </section>

      <p className="text-sm text-muted-foreground">
        Gefällt es euch? Ihr könnt{" "}
        <Link href="/registrieren" className="underline">
          euren Verein registrieren
        </Link>{" "}
        oder uns einfach schreiben.
      </p>
    </main>
  );
}
