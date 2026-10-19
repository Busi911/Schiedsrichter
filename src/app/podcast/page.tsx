import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLinkIcon, HeadphonesIcon, UsersIcon, RefreshCwIcon, ClipboardCheckIcon, CalendarClockIcon, ShieldCheckIcon } from "lucide-react";
import {
  BETA_ENDE,
  PREIS_BETA,
  PREIS_REGULAER,
  PREIS_RABATT_PODCAST,
  NETTO,
  KEIN_RISIKO,
  PODCAST_HERKUNFT,
} from "@/lib/beta-konditionen";
import { betaVorbei } from "@/lib/abrechnung";
import { betaPlaetzeSatz } from "@/lib/beta-plaetze";
import { holeBetaStand } from "@/lib/system-einstellungen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Handballkäs × HandballerPate – 100 € Rabatt für Mittelhessens Vereine",
  description: `Der Handball-Podcast aus Mittelhessen trifft auf HandballerPate. Vereine, die über diese Seite registrieren, bekommen ${PREIS_RABATT_PODCAST} € Rabatt — kostenlos bis ${BETA_ENDE}, danach ${PREIS_BETA} € statt ${PREIS_REGULAER} €.`,
};

export const dynamic = "force-dynamic";

const PODCAST_URL = "https://open.spotify.com/show/5h641V15Wnv2NrGtch9KlR";
const PODCAST_INSTAGRAM = "https://www.instagram.com/handballkaes/";

const VORTEILE = [
  {
    icon: RefreshCwIcon,
    titel: "Spielplan & Ergebnisse automatisch",
    text: "nuLiga (Hessen, Berlin, Thüringen) und handball.net ab der 3. Liga — Spielplan, Ergebnisse und Tabellen ohne Handarbeit.",
  },
  {
    icon: UsersIcon,
    titel: "Funktionsträger zentral verwalten",
    text: "Schiedsrichter, Zeitnehmer, Ordner, Kioskdienst und Trainer an einem Ort — inklusive Excel-Import und automatischen Erinnerungen.",
  },
  {
    icon: ClipboardCheckIcon,
    titel: "Einsätze fair zuordnen",
    text: "Wer hat schon gepfiffen, wer nicht? Die Wart-Rollen sehen die Verteilung auf einen Blick und ordnen direkt zu.",
  },
  {
    icon: CalendarClockIcon,
    titel: "Persönlicher Kalender",
    text: "Jeder Funktionsträger sieht seine Einsätze und kann sie als Kalender-Abo in Apple/Google/Outlook einbinden.",
  },
  {
    icon: ShieldCheckIcon,
    titel: "Datenschutz & DSGVO",
    text: "Mandantengetrennte Datenhaltung, Auftragsverarbeitungsvertrag und Datenschutzerklärung von Anfang an dabei.",
  },
];

export default async function PodcastSeite() {
  const beta = await holeBetaStand();
  const betaEnde = betaVorbei(new Date());
  const plaetzeHinweis = betaPlaetzeSatz(beta.frei);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-8 md:py-12">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-3">
            <Logo className="size-12 text-primary" />
            <span className="text-2xl font-bold">×</span>
            <HeadphonesIcon className="size-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">
            Handballkäs × HandballerPate
          </h1>
          <p className="text-sm text-muted-foreground">
            Der Handball-Podcast aus Mittelhessen trifft auf die Vereins-App für Hessen, Berlin und Thüringen.
          </p>
        </div>

        {/* Podcast-Karte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HeadphonesIcon className="size-5 text-primary" />
              Handballkäs — der Podcast
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              <strong>DER Handball-Podcast aus und für Mittelhessen.</strong> Neben Erstligist HSG Wetzlar und
              Zweitligist TV Hüttenberg sind unzählige Vereine bis in die unteren Spielklassen vertreten.
              Danny Pieth gibt euch eine Stimme — Geschichten aus Kabine, Halle und Tribüne.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href={PODCAST_URL} target="_blank" rel="noopener noreferrer" />} size="sm">
                Auf Spotify anhören <ExternalLinkIcon className="ml-1 size-3" />
              </Button>
              <Button render={<Link href={PODCAST_INSTAGRAM} target="_blank" rel="noopener noreferrer" />} variant="outline" size="sm">
                Instagram <ExternalLinkIcon className="ml-1 size-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* HandballerPate-Karte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Logo className="size-5 text-primary" />
              HandballerPate — die App
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              HandballerPate ist die Vereins-App für Funktionsträger-Verwaltung, Spielplan und Ergebnisse.
              Spieler, Eltern und Fans sehen Spielplan und Ergebnisse ohne Login — als App installierbar.
              Vereinsadmins verwalten Schiedsrichter, Zeitnehmer, Ordner und Trainer an einem Ort.
            </p>
          </CardContent>
        </Card>

        {/* Vorteile */}
        <div className="flex flex-col gap-3">
          {VORTEILE.map((v) => (
            <Card key={v.titel} size="sm">
              <CardContent className="flex gap-3">
                <v.icon className="size-5 shrink-0 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{v.titel}</p>
                  <p className="text-xs text-muted-foreground">{v.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Angebot */}
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">
              Das Angebot für Hörerinnen und Hörer
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-700 text-white">Während der Beta</Badge>
                <span>Kostenlos — bis {BETA_ENDE}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-white">100 € Rabatt</Badge>
                <span>
                  Beta-Tester: {PREIS_BETA - PREIS_RABATT_PODCAST} € statt {PREIS_BETA} € im ersten Jahr.
                  Danach {PREIS_BETA} € statt {PREIS_REGULAER} €.
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{NETTO} {KEIN_RISIKO}</p>
              {plaetzeHinweis && !betaEnde && (
                <p className="text-xs font-medium text-primary">{plaetzeHinweis}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">So funktioniert&apos;s:</p>
              <p>1. Auf „Verein registrieren&quot; klicken — der Rabatt wird automatisch berücksichtigt.</p>
              <p>2. Verein und Admin-Daten eintragen. Während der Beta kostenlos, danach 14 Tage testen.</p>
              <p>3. Nach der Beta: Rechnung über den reduzierten Preis per E-Mail. Zahlungsziel 30 Tage.</p>
            </div>

            <Button
              render={<Link href={`/registrieren?herkunft=${PODCAST_HERKUNFT}`} />}
              className="h-14 px-8 text-lg transition-transform hover:-translate-y-0.5 active:scale-[0.97]"
            >
              Verein registrieren mit {PREIS_RABATT_PODCAST} € Rabatt
            </Button>
          </CardContent>
        </Card>

        {/* Footer-Hinweis */}
        <p className="text-center text-xs text-muted-foreground">
          Handballkäs ist ein Podcast von Danny Pieth. HandballerPate ist ein Angebot der DeWe Consulting UG
          (haftungsbeschränkt). Die Aktion gilt für Registrierungen über diese Seite während der Beta-Phase
          und im ersten Abrechnungsjahr danach.
        </p>
      </div>
    </main>
  );
}
