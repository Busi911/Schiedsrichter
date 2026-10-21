import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  DatabaseIcon,
  SearchIcon,
  StarIcon,
  TrophyIcon,
  MailCheckIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UsersIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { holeAlleVereine } from "@/lib/liga-oeffentlich";
import { appUrl } from "@/lib/app-url";
import { BETA_ENDE, PREIS_BETA, PREIS_REGULAER, KEIN_RISIKO, NETTO, SPONSOR_KURZ } from "@/lib/beta-konditionen";
import { betaVorbei } from "@/lib/abrechnung";
import { holeBetaStand } from "@/lib/system-einstellungen";
import { betaPlaetzeSatz } from "@/lib/beta-plaetze";
import { Vereinsuche } from "@/components/liga/vereinsuche";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ProdukttourBild } from "@/components/produkttour-bild";
import { Einblenden } from "@/components/einblenden";
import masse from "../../public/produkttour/masse.json";

// Große, gut tippbare Buttons auf der Startseite (mobil zuerst): 56 px hoch, mit leichtem Druck-Effekt.
const GROSSER_BUTTON = "h-14 px-8 text-lg transition-transform hover:-translate-y-0.5 active:scale-[0.97]";

const FEATURES = [
  {
    icon: SmartphoneIcon,
    titel: "Die App für Spieler, Eltern und Fans",
    text: "Spielplan, Ergebnisse und Tabellen eures Vereins — ohne Login, als App aufs Handy installierbar, mit euren Lieblingsmannschaften als Favoriten.",
  },
  {
    icon: UsersIcon,
    titel: "Funktionsträger zentral verwalten",
    text: "Schiedsrichter, Zeitnehmer, Sekretäre, Ordner, Kioskdienst, Kassierer und Trainer an einem Ort — inklusive Excel-Import.",
  },
  {
    icon: RefreshCwIcon,
    titel: "Spielplan und Ergebnisse automatisch",
    text: "Hessen und Berlin über nuLiga (weitere Landesverbände auf Anfrage), ab der 3. Liga bundesweit über handball.net, 1. und 2. Bundesliga über den NDR — Spielplan, Ergebnisse und Tabellen ohne Handarbeit.",
  },
  {
    icon: ClipboardCheckIcon,
    titel: "Einsätze fair zuordnen",
    text: "Wer hat schon gepfiffen, wer nicht? Die Wart-Rollen sehen die Verteilung auf einen Blick und ordnen direkt zu.",
  },
  {
    icon: CalendarClockIcon,
    titel: "Persönlicher Kalender",
    text: "Jeder Funktionsträger sieht seine eigenen Einsätze und kann sie als Kalender-Abo in Apple/Google/Outlook einbinden.",
  },
  {
    icon: CalendarDaysIcon,
    titel: "Trainingsplan je Halle",
    text: "Wöchentliche Trainingszeiten für alle Mannschaften und Hallen per Drag & Drop planen — inklusive geteilter Hallen mit bis zu vier benennbaren Abteilen. Fällt ein Training aus, melden Trainer das mit einem Klick, und alle Trainer erfahren per Mail, dass die Halle frei ist.",
  },
  {
    icon: MailCheckIcon,
    titel: "Automatische Erinnerungen",
    text: "Vor unbesetzten Diensten, auslaufenden Lizenzen und anstehenden Terminen — per E-Mail, konfigurierbar pro Verein und Person.",
  },
  {
    icon: ShieldCheckIcon,
    titel: "Datenschutz & DSGVO",
    text: "Mandantengetrennte Datenhaltung, Auftragsverarbeitungsvertrag und Datenschutzerklärung von Anfang an mit dabei.",
  },
];

// Screenshots mit Beispieldaten (Demo-Verein, keine echten Nutzerdaten) aus
// src/app/page.tsx-Produkttour — bei sichtbaren UI-Änderungen an den
// gezeigten Seiten (Übersicht, Kalender, Offene Dienste) neu erstellen, sonst veraltet die Tour optisch gegenüber
// der echten App.
const PRODUKTTOUR = [
  {
    bild: "/produkttour/uebersicht.png",
    breite: masse.uebersicht.breite,
    hoehe: masse.uebersicht.hoehe,
    titel: "Alles auf einen Blick",
    text: "Die Admin-Übersicht zeigt sofort, welche Termine noch Schiedsrichter oder Zeitnehmer brauchen — und die letzten Ergebnisse aus dem Hallenspielplan.",
  },
  {
    bild: "/produkttour/kalender.png",
    breite: masse.kalender.breite,
    hoehe: masse.kalender.hoehe,
    titel: "Kalender mit Besetzungsstatus",
    text: "Auf den ersten Blick: welche Spiele vollständig besetzt sind und wo noch Personal fehlt — mit Farbe je Mannschaft und Tagesdetails neben dem Monatsgitter.",
  },
  {
    bild: "/produkttour/dienste.png",
    breite: masse.dienste.breite,
    hoehe: masse.dienste.hoehe,
    titel: "Offene Dienste fair verteilen",
    text: "Wer hat schon wie oft gepfiffen oder Kiosk/Ordnerdienst übernommen? Die Statistik zeigt die Verteilung, offene Termine sind sofort sichtbar.",
  },
];

// Suchmaschinen und KI-Assistenten (Titel, Beschreibung, kanonische Adresse): die Startseite erklärt das Gesamtangebot und führt zu
// Verein/Mannschaft; die konkreten Suchanfragen ("<Verein> Spielplan") beantworten die Vereins- und Mannschaftsseiten.
export const metadata: Metadata = {
  title: { absolute: "HandballerPate – Handball Spielplan, Ergebnisse & Tabellen deines Vereins" },
  description:
    "Verein suchen, Mannschaft wählen, Spielplan, Ergebnisse und Tabellen im Blick – kostenlos, ohne Login, auf Handy und Computer. Für Handballvereine auch mit Dienstplanung.",
  alternates: { canonical: appUrl() },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "HandballerPate",
    url: appUrl(),
    title: "HandballerPate – Handball Spielplan, Ergebnisse & Tabellen deines Vereins",
    description: "Verein suchen, Mannschaft wählen, Spielplan, Ergebnisse und Tabellen im Blick – kostenlos und ohne Login.",
    images: [{ url: "/brand/logo-gross.png", width: 900, height: 634, alt: "HandballerPate" }],
  },
  twitter: { card: "summary_large_image", title: "HandballerPate – Handball Spielplan, Ergebnisse & Tabellen", description: "Spielplan, Ergebnisse und Tabellen deines Handballvereins – kostenlos und ohne Login." },
};

// Drei Schritte der Fan-Nutzung (sichtbar unter der Suche).
const SCHRITTE = [
  { icon: SearchIcon, titel: "Verein suchen", text: "Namen eintippen oder in der Liste auswählen." },
  { icon: UsersIcon, titel: "Mannschaft wählen", text: "Jede Mannschaft hat eigenen Spielplan, Ergebnisse und Tabelle." },
  { icon: StarIcon, titel: "Überblick behalten", text: "Mit dem Stern merkst du dir Mannschaften – gespeichert nur in deinem Browser." },
];

// Was die öffentliche App tatsächlich kann (nur Vorhandenes, siehe /app-hilfe).
const APP_VORTEILE = [
  { icon: CalendarDaysIcon, titel: "Nächste Spiele", text: "Datum, Uhrzeit und Halle aller Mannschaften deines Vereins, am Spieltag ganz oben." },
  { icon: TrophyIcon, titel: "Ergebnisse und Tabellen", text: "Letzte Ergebnisse, Tabellenplatz und Form je Mannschaft; Zwischenstände werden nicht als Endstand gezeigt." },
  { icon: SmartphoneIcon, titel: "Als App aufs Handy", text: "Die Seite deines Vereins lässt sich über „Zum Home-Bildschirm“ wie eine App installieren." },
];

// Häufige Fragen: sichtbar auf der Seite UND als FAQPage-Daten (JSON-LD). Zuerst die Fragen von Spielern/Eltern/Fans, danach die der Vereine.
function faqEintraege(live: boolean) {
  return [
    {
      frage: "Was ist HandballerPate?",
      antwort:
        "HandballerPate zeigt Spielpläne, Ergebnisse und Tabellen der Mannschaften teilnehmender Handballvereine – übersichtlich auf dem Handy und am Computer, ohne Login. Vereine nutzen zusätzlich die Verwaltung, um Schiedsrichter, Zeitnehmer, Ordner und weitere Dienste einzuteilen.",
    },
    {
      frage: "Wie finde ich den Spielplan meiner Mannschaft?",
      antwort:
        "Oben den Vereinsnamen eingeben und den Verein öffnen, dann unter „Teams“ die Mannschaft wählen. Dort stehen Spielplan, Ergebnisse und Tabelle. Mit dem Stern speicherst du Mannschaften als Favoriten.",
    },
    {
      frage: "Woher kommen die Daten und wie aktuell sind sie?",
      antwort:
        "Die Spieldaten stammen aus den öffentlichen Ergebnisseiten von nuLiga (Hessischer Handball-Verband und Handball-Verband Berlin), handball.net (DHB-Wettbewerbe ab der 3. Liga) und dem NDR (1. und 2. Handball-Bundesliga der Männer). Sie werden mehrmals täglich abgeglichen, am Spieltag häufiger. Auf jeder Vereinsseite steht, wann zuletzt aktualisiert wurde. Laufende Spiele zeigen wir mit dem Hinweis „Läuft gerade“ statt eines Zwischenstands als Ergebnis. HandballerPate ist kein offizielles Angebot der Verbände; verbindlich bleiben die Angaben der Verbände.",
    },
    {
      frage: "Mein Verein fehlt. Was kann ich tun?",
      antwort:
        "Es sind nur Vereine zu finden, die sich bei HandballerPate angemeldet haben oder eingerichtet wurden. Sprich Vorstand oder Abteilungsleitung an: Ein Verein kann sich selbst registrieren.",
    },
    {
      frage: "Müssen sich Spieler und Eltern registrieren?",
      antwort:
        "Nein. Spielplan, Ergebnisse und Tabellen sind ohne Login sichtbar, und die Seite des Vereins lässt sich als App aufs Handy installieren. Favoriten werden nur im eigenen Browser gespeichert, es gibt kein Konto und kein Tracking.",
    },
    {
      frage: "Welche Verbände und Ligen werden unterstützt?",
      antwort:
        "Über nuLiga der Hessische Handball-Verband (HHV) und der Handball-Verband Berlin (HVBerlin), weitere nuLiga-Verbände auf Anfrage. Über handball.net DHB-Wettbewerbe ab der 3. Liga, inklusive Jugendbundesliga. Die 1. und 2. Handball-Bundesliga der Männer kommen über den NDR.",
    },
    {
      frage: "Was kostet HandballerPate für Vereine?",
      antwort: live
        ? `Neue Vereine testen HandballerPate 14 Tage kostenlos. Danach entscheidet ihr, ob ihr weitermacht (ohne Bestätigung wird der Zugang pausiert, die Daten bleiben): ${PREIS_REGULAER} € netto pro Jahr (zzgl. gesetzlicher MwSt.), die Rechnung kommt erst dann per E-Mail, das Zahlungsziel beträgt 30 Tage. Optional kann ein Sponsor die Kosten übernehmen („Präsentiert von …“ beim Öffnen der Vereinsseite). Für Spieler, Eltern und Fans ist die App kostenlos.`
        : `Die Beta-Phase läuft bis ${BETA_ENDE} und ist kostenlos. Wer in der Beta dabei ist, zahlt danach ${PREIS_BETA} € statt ${PREIS_REGULAER} € netto pro Jahr (zzgl. gesetzlicher MwSt.). Vor dem Ende der Beta kann jeder Verein ohne Kosten aussteigen, dann werden alle Daten gelöscht. ${SPONSOR_KURZ} Für Spieler, Eltern und Fans ist die App kostenlos.`,
    },
    {
      frage: "Wie tragen sich Eltern für Dienste ein?",
      antwort:
        "Es gibt einen gemeinsamen Eintragungs-Link: Der Zeitnehmerwart schaltet den Teil für Zeitnehmer und Sekretär frei, der Ordnerwart den für Ordner, Kioskdienst und Kassierer. Darüber wählen Eltern und Helfer ohne Login ihre Termine und tragen sich ein. Mit einer E-Mail-Adresse entsteht auf Wunsch ein eigener Zugang mit Kalender und Erinnerungen.",
    },
    {
      frage: "Wie steht es um den Datenschutz?",
      antwort:
        "Die Daten der Vereine sind strikt voneinander getrennt. Ein Auftragsverarbeitungsvertrag und die Datenschutzerklärung liegen von Anfang an bei. Auf den öffentlichen Vereinsseiten erscheinen nur Sport-Daten (Spielpläne, Ergebnisse, Tabellen), keine Personendaten wie Schiedsrichter-Namen. Ansetzungen landen nur in den privaten Terminen des Vereins.",
    },
  ];
}

// Strukturierte Daten (schema.org): Organisation, Website, Software und FAQ der Startseite.
function startseiteJsonLd(live: boolean) {
  const basis = appUrl();
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${basis}/#organisation`, name: "HandballerPate", url: basis, logo: `${basis}/brand/logo-rund.png` },
      { "@type": "WebSite", "@id": `${basis}/#website`, url: basis, name: "HandballerPate", inLanguage: "de-DE", publisher: { "@id": `${basis}/#organisation` } },
      {
        "@type": "SoftwareApplication",
        "@id": `${basis}/#software`,
        name: "HandballerPate",
        url: basis,
        applicationCategory: "SportsApplication",
        operatingSystem: "Web, iOS, Android (als installierbare Web-App)",
        inLanguage: "de-DE",
        description:
          "Spielpläne, Ergebnisse und Tabellen von Handballvereinen als Web-App; für Vereine zusätzlich Dienstplanung (Schiedsrichter, Zeitnehmer, Ordner) und Übernahme des Spielplans aus nuLiga und handball.net.",
        publisher: { "@id": `${basis}/#organisation` },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqEintraege(live).map((e) => ({ "@type": "Question", name: e.frage, acceptedAnswer: { "@type": "Answer", text: e.antwort } })),
      },
    ],
  };
}

// Zeigt bei jedem Aufruf die aktuelle Beta-Platzzahl (siehe unten) — ohne
// diese Direktive würde Next.js die Seite statisch vorrendern (kein
// erzwungener cookies()-Zugriff wie auf eingeloggten Seiten) und die Zahl
// für die gesamte Deploy-Lebensdauer einfrieren.
export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    if (session.user.istSystemAdmin) redirect("/system");
    redirect(
      session.user.istAdmin || session.user.istAdminLesend ? "/admin" : "/profil"
    );
  }

  const beta = await holeBetaStand();
  // Neue Vereine zahlen nach dem Beta-Ende oder wenn alle Beta-Plätze vergeben sind (lib/beta-plaetze.ts): dann zeigt die Startseite den regulären Preis.
  const live = betaVorbei(new Date()) || beta.voll;
  // Vereine mit öffentlicher Seite: dieselbe Abfrage wie bisher (keine zusätzliche); sie speist Suche und Direkteinstiege im ausgelieferten HTML.
  const vereineMitSeite = await holeAlleVereine();

  const faq = faqEintraege(live);

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(startseiteJsonLd(live)).replace(/</g, "\\u003c") }}
      />
      {/* Oben: Marke, die zwei Fan-Einstiege und der Login (wiederkehrende Funktionsträger/Admins wollen direkt einloggen). */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-8" />
            <span className="font-heading font-semibold">HandballerPate</span>
          </div>
          <nav aria-label="Hauptnavigation" className="flex items-center gap-1 sm:gap-3">
            <Link href="/verein" className="hidden min-h-11 items-center px-2 text-sm font-medium hover:underline sm:inline-flex">
              Vereine
            </Link>
            <Link href="/meine" className="hidden min-h-11 items-center px-2 text-sm font-medium hover:underline sm:inline-flex">
              Meine Mannschaften
            </Link>
            <Link href="/registrieren" className="inline-flex min-h-11 items-center px-2 text-sm font-medium hover:underline">
              Registrieren
            </Link>
            <Button variant="outline" className="h-11 px-5 text-base transition-transform active:scale-[0.97]" render={<Link href="/login" />} nativeButton={false}>
              Login
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Erster Bildschirm: Nutzen in einem Satz und sofort die Vereinssuche (ohne Einblend-Animation, damit Überschrift und Suche sofort da sind). */}
        <section aria-labelledby="hero-titel" className="bg-primary/5">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
            <div className="space-y-3 text-center">
              <h1 id="hero-titel" className="font-heading text-3xl font-semibold text-balance hyphens-auto sm:text-5xl">
                Dein Handballverein. Alle Mannschaften im Blick.
              </h1>
              <p className="mx-auto max-w-xl text-base text-muted-foreground text-balance sm:text-lg">
                Entdecke Spielpläne, Ergebnisse und Tabellen deines Vereins – übersichtlich auf dem Handy und am Computer, kostenlos und ohne Login.
              </p>
            </div>
            <div id="vereine" className="scroll-mt-4 space-y-3 rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
              <h2 className="font-heading text-lg font-semibold">Verein finden</h2>
              {vereineMitSeite.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch keine Vereine freigeschaltet.</p>
              ) : (
                <Vereinsuche vereine={vereineMitSeite} maxAnzeige={6} />
              )}
              <div className="flex flex-wrap gap-x-5 text-sm">
                <Link href="/verein" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                  Alle Vereine ansehen
                </Link>
                <Link href="/meine" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                  Meine Mannschaften
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t" aria-labelledby="schritte-titel">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <h2 id="schritte-titel" className="text-center font-heading text-2xl font-semibold">
              In drei Schritten zum Spielplan
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {SCHRITTE.map((st, i) => (
                <li key={st.titel} className="flex gap-3 rounded-lg border bg-background p-4">
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading font-bold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-heading font-medium">{st.titel}</h3>
                    <p className="text-sm text-muted-foreground">{st.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t bg-muted/30" aria-labelledby="vorteile-titel">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <h2 id="vorteile-titel" className="text-center font-heading text-2xl font-semibold">
              Das findest du in der App
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {APP_VORTEILE.map((f) => (
                <div key={f.titel} className="flex flex-col gap-2 rounded-lg border bg-background p-4">
                  <f.icon aria-hidden="true" className="size-6 text-primary" />
                  <h3 className="font-heading font-medium">{f.titel}</h3>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Mehr dazu in der <Link href="/app-hilfe" className="font-medium underline underline-offset-4">Hilfe zur App</Link>.
            </p>
          </div>
        </section>

        <section className="border-t" aria-labelledby="daten-titel">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-12 sm:px-6">
            <h2 id="daten-titel" className="flex items-center gap-2 font-heading text-2xl font-semibold">
              <DatabaseIcon aria-hidden="true" className="size-6 text-primary" />
              Woher die Daten kommen
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">nuLiga:</strong> Hessischer Handball-Verband und Handball-Verband Berlin.
              </li>
              <li>
                <strong className="font-medium text-foreground">handball.net:</strong> DHB-Wettbewerbe ab der 3. Liga, inklusive Jugendbundesliga.
              </li>
              <li>
                <strong className="font-medium text-foreground">NDR:</strong> 1. und 2. Handball-Bundesliga der Männer.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Es sind die Vereine zu finden, die bei HandballerPate angemeldet oder eingerichtet sind. Die Daten werden mehrmals täglich
              abgeglichen; auf jeder Vereinsseite steht der Stand der letzten Aktualisierung. HandballerPate ist kein offizielles Angebot
              der Verbände – verbindlich sind deren Angaben.
            </p>
          </div>
        </section>

        {/* Für Vereine: die bisherige Verwaltungs-Werbung, jetzt nach dem Fan-Angebot. */}
        <section id="fuer-vereine" className="scroll-mt-4 border-t bg-muted/30" aria-labelledby="vereine-titel">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 py-14 text-center sm:px-6">
            <Badge variant="secondary" className="h-7 px-3 text-sm">{live ? `${PREIS_REGULAER} € netto im Jahr` : "Beta · 100% kostenlos"}</Badge>
            <h2 id="vereine-titel" className="font-heading text-3xl font-semibold text-balance">
              Du bist im Verein aktiv? Organisiere Spielbetrieb und Dienste an einem Ort.
            </h2>
            <p className="max-w-xl text-lg text-muted-foreground text-balance">
              Funktionsträger, Hallenspielplan und Einsatzplanung – automatisch synchron mit nuLiga bzw. handball.net, statt
              Excel-Listen und WhatsApp-Nachrichten hinterherzutelefonieren.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button className={GROSSER_BUTTON} render={<Link href="/registrieren" />} nativeButton={false}>
                {live ? "14 Tage kostenlos testen" : "Verein kostenlos registrieren"}
              </Button>
              <Button variant="outline" className={GROSSER_BUTTON} render={<Link href="/demo" />} nativeButton={false}>
                Demo ansehen
              </Button>
            </div>
            {!live && <p className="text-sm text-muted-foreground">{betaPlaetzeSatz(beta.frei)}</p>}
            <div className="max-w-xl space-y-1 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              {live ? (
                <p>
                  <span className="font-medium text-foreground">14 Tage kostenlos testen.</span> Weitermachen bestätigt ihr selbst: {PREIS_REGULAER} € im Jahr, Rechnung erst dann per E-Mail, Zahlungsziel 30 Tage.
                </p>
              ) : (
                <p>
                  <span className="font-medium text-foreground">Beta bis {BETA_ENDE}.</span> Wer in der Beta-Phase dabei ist,
                  zahlt danach nur {PREIS_BETA} € statt {PREIS_REGULAER} € im Jahr.
                </p>
              )}
              <p className="text-xs">{NETTO}</p>
              {!live && <p>{KEIN_RISIKO}</p>}
              <p>{SPONSOR_KURZ}</p>
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 className="text-center font-heading text-2xl font-semibold">
              Was HandballerPate für Vereine kann
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Einblenden key={f.titel} verzoegerung={(i % 3) * 100} className="h-full">
                  <div className="group flex h-full flex-col gap-2 rounded-lg border bg-background p-4 transition duration-200 hover:-translate-y-1 hover:shadow-md">
                    <f.icon aria-hidden="true" className="size-6 text-primary transition-transform duration-200 group-hover:scale-110" />
                    <h3 className="font-heading font-medium">{f.titel}</h3>
                    <p className="text-sm text-muted-foreground">{f.text}</p>
                  </div>
                </Einblenden>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
              <h2 className="font-heading text-2xl font-semibold">
                So sieht die Vereinsverwaltung in der Praxis aus
              </h2>
              <p className="text-sm text-muted-foreground">
                Mit Beispieldaten eines fiktiven Vereins.
              </p>
            </div>
            <div className="mt-10 flex flex-col gap-14">
              {PRODUKTTOUR.map((eintrag, i) => (
                <Einblenden
                  key={eintrag.bild}
                  className="grid items-center gap-6 md:grid-cols-2 md:gap-10"
                >
                  <div className={i % 2 === 1 ? "order-1 md:order-2" : "order-1"}>
                    <ProdukttourBild
                      src={eintrag.bild}
                      alt={eintrag.titel}
                      breite={eintrag.breite}
                      hoehe={eintrag.hoehe}
                    />
                  </div>
                  <div className={i % 2 === 1 ? "order-2 flex flex-col gap-2 md:order-1" : "order-2 flex flex-col gap-2"}>
                    <h3 className="font-heading text-lg font-medium">{eintrag.titel}</h3>
                    <p className="text-sm text-muted-foreground">{eintrag.text}</p>
                  </div>
                </Einblenden>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t" aria-labelledby="faq-titel">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-14 sm:px-6">
            <h2 id="faq-titel" className="font-heading text-2xl font-semibold">
              Häufige Fragen
            </h2>
            <div className="flex flex-col gap-2">
              {faq.map((e) => (
                <details key={e.frage} className="group rounded-lg border bg-background px-4">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-base font-medium [&::-webkit-details-marker]:hidden">
                    {e.frage}
                    <span aria-hidden="true" className="text-xl text-muted-foreground transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-base text-muted-foreground">{e.antwort}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
