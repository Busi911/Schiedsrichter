import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarClockIcon,
  CheckIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
} from "lucide-react";
import { BETA_ENDE, KEIN_RISIKO, NETTO, PODCAST_HERKUNFT, PREIS_BETA, PREIS_RABATT_PODCAST, PREIS_REGULAER } from "@/lib/beta-konditionen";
import { betaVorbei } from "@/lib/abrechnung";
import { betaPlaetzeSatz } from "@/lib/beta-plaetze";
import { holeBetaStand } from "@/lib/system-einstellungen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Handballkäs × HandballerPate",
  description: `Der Handball-Podcast aus Mittelhessen trifft auf HandballerPate. Vereine, die über diese Seite registrieren, bekommen ${PREIS_RABATT_PODCAST} € Rabatt.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PODCAST_URL = "https://open.spotify.com/show/5h641V15Wnv2NrGtch9KlR";
const PODCAST_INSTAGRAM = "https://www.instagram.com/handballkaes/";
const GROSSER_BUTTON = "h-14 px-8 text-lg transition-transform hover:-translate-y-0.5 active:scale-[0.97]";

const VORTEILE = [
  { icon: RefreshCwIcon, titel: "Spielplan & Ergebnisse automatisch", text: "Aus nuLiga und handball.net, ohne Handarbeit." },
  { icon: UsersIcon, titel: "Funktionsträger an einem Ort", text: "Schiedsrichter, Zeitnehmer, Ordner und Trainer, mit Excel-Import und Erinnerungen." },
  { icon: ClipboardCheckIcon, titel: "Einsätze fair verteilen", text: "Die Wart-Rollen sehen auf einen Blick, wer wie oft dran war." },
  { icon: CalendarClockIcon, titel: "Persönlicher Kalender", text: "Jeder sieht seine Einsätze, auch als Kalender-Abo." },
  { icon: SmartphoneIcon, titel: "App für Spieler, Eltern und Fans", text: "Spielplan und Ergebnisse ohne Login, installierbar auf dem Handy." },
  { icon: ShieldCheckIcon, titel: "DSGVO von Anfang an", text: "Getrennte Vereinsdaten, Auftragsverarbeitungsvertrag inklusive." },
];

const SCHRITTE = [
  { titel: "Registrieren", text: "Verein und Admin eintragen, der Rabatt ist schon dabei." },
  { titel: "Einrichten", text: "Spielplan anbinden, Funktionsträger anlegen. Kostenlos bis " + BETA_ENDE + "." },
  { titel: "Danach entscheiden", text: "Rechnung zum reduzierten Preis, Zahlungsziel 30 Tage." },
];

export default async function PodcastSeite() {
  const beta = await holeBetaStand();
  const betaEnde = betaVorbei(new Date());
  const plaetzeHinweis = !betaEnde ? betaPlaetzeSatz(beta.frei) : null;
  const registrieren = `/registrieren?herkunft=${PODCAST_HERKUNFT}`;

  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-primary/15 via-primary/5 to-background px-4 pt-12 pb-14 md:pt-20 md:pb-20">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-4">
            <Image
              src="/podcast/handballkaes-logo.jpg"
              alt="Logo des Podcasts Handballkäs"
              width={512}
              height={504}
              priority
              className="size-20 rounded-2xl shadow-sm ring-1 ring-border sm:size-24"
            />
            <span className="text-2xl font-light text-muted-foreground">×</span>
            <span className="flex size-20 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-border sm:size-24">
              <Logo className="size-11 text-primary" />
            </span>
          </div>
          <Badge variant="outline" className="bg-background/70">Für Hörerinnen und Hörer von Handballkäs</Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {PREIS_RABATT_PODCAST} € Rabatt für euren Verein
          </h1>
          <p className="max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Der Handball-Podcast aus Mittelhessen und die Vereins-App für Spielplan, Ergebnisse und Dienste: gemeinsam für weniger Orga-Chaos in der Halle.
          </p>
          <div className="flex w-full flex-col items-center gap-3">
            <Button render={<Link href={registrieren} />} className={GROSSER_BUTTON}>
              Verein registrieren
            </Button>
            <p className="text-xs text-muted-foreground">Kostenlos bis {BETA_ENDE} · {KEIN_RISIKO}</p>
            {plaetzeHinweis && <p className="text-xs font-medium text-primary">{plaetzeHinweis}</p>}
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-14 px-4 py-12 md:py-16">
        {/* Podcast */}
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
          <div className="flex items-center gap-4">
            <Image src="/podcast/handballkaes-logo.jpg" alt="" width={512} height={504} className="size-16 rounded-xl ring-1 ring-border" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Der Podcast</p>
              <h2 className="text-2xl font-bold">Handballkäs</h2>
            </div>
          </div>
          <p className="text-muted-foreground">
            Der Handball-Podcast aus und für Mittelhessen. Danny Pieth gibt dem Handball der Region eine Stimme, von den Profis bis in die unteren Spielklassen: Geschichten aus Kabine, Halle und Tribüne.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href={PODCAST_URL} target="_blank" rel="noopener noreferrer" />}>
              Auf Spotify anhören <ExternalLinkIcon className="ml-1 size-3.5" />
            </Button>
            <Button render={<Link href={PODCAST_INSTAGRAM} target="_blank" rel="noopener noreferrer" />} variant="outline">
              Instagram <ExternalLinkIcon className="ml-1 size-3.5" />
            </Button>
          </div>
        </section>

        {/* Vorteile */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Die App</p>
            <h2 className="text-2xl font-bold">HandballerPate nimmt euch die Orga ab</h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {VORTEILE.map((v) => (
              <li key={v.titel} className="flex gap-3 rounded-xl border bg-card p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <v.icon className="size-5 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{v.titel}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{v.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Ablauf */}
        <section className="flex flex-col gap-6">
          <h2 className="text-center text-2xl font-bold">In drei Schritten dabei</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {SCHRITTE.map((s, i) => (
              <li key={s.titel} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <p className="font-semibold">{s.titel}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Angebot */}
        <section className="flex flex-col gap-5 rounded-2xl border-2 border-primary bg-primary/5 p-6 md:p-8">
          <h2 className="text-2xl font-bold">Das Angebot</h2>
          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span><strong>Bis {BETA_ENDE} kostenlos</strong>, voll nutzbar.</span>
            </li>
            <li className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <strong>Im ersten Abrechnungsjahr {PREIS_RABATT_PODCAST} € weniger:</strong> {PREIS_BETA - PREIS_RABATT_PODCAST} € statt {PREIS_BETA} € für Beta-Vereine,
                {" "}{PREIS_REGULAER - PREIS_RABATT_PODCAST} € statt {PREIS_REGULAER} € nach der Beta.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Das Folgejahr zum regulären Preis. {NETTO}</span>
            </li>
          </ul>
          <Button render={<Link href={registrieren} />} className={GROSSER_BUTTON + " w-full sm:w-auto sm:self-start"}>
            Jetzt mit {PREIS_RABATT_PODCAST} € Rabatt registrieren
          </Button>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          Handballkäs ist ein Podcast von Danny Pieth. HandballerPate ist ein Angebot der DeWe Consulting UG (haftungsbeschränkt).
          Die Aktion gilt für Registrierungen über diese Seite.
        </p>
      </div>
    </main>
  );
}
