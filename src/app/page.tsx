import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClockIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  MailCheckIcon,
  MessageCircleIcon,
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
import { holeSystemEinstellungen, zaehleVereineFuerBetaLimit } from "@/lib/system-einstellungen";
import { Vereinsuche } from "@/components/liga/vereinsuche";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ProdukttourBild } from "@/components/produkttour-bild";
import { Einblenden } from "@/components/einblenden";

// Große, gut tippbare Buttons auf der Startseite (mobil zuerst): 56 px hoch, mit leichtem Druck-Effekt.
const GROSSER_BUTTON = "h-14 px-8 text-lg transition-transform hover:-translate-y-0.5 active:scale-[0.97]";

const FEATURES = [
  {
    icon: SmartphoneIcon,
    titel: "Die App für Spieler, Eltern und Fans",
    text: "Spielplan, Ergebnisse, Tabellen und Live-Ticker eures Vereins — ohne Login, als App aufs Handy installierbar, mit euren Lieblingsmannschaften als Favoriten.",
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
    text: "Wöchentliche Trainingszeiten für alle Mannschaften und Hallen per Drag & Drop planen — inklusive geteilter Hallen mit bis zu vier benennbaren Abteilen.",
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
    breite: 1440,
    hoehe: 530,
    titel: "Alles auf einen Blick",
    text: "Die Admin-Übersicht zeigt sofort, welche Termine noch Schiedsrichter oder Zeitnehmer brauchen — und die letzten Ergebnisse aus dem Hallenspielplan.",
  },
  {
    bild: "/produkttour/kalender.png",
    breite: 1440,
    hoehe: 600,
    titel: "Kalender mit Besetzungsstatus",
    text: "Auf den ersten Blick: welche Spiele vollständig besetzt sind und wo noch Personal fehlt — mit Farbe je Mannschaft und Tagesdetails neben dem Monatsgitter.",
  },
  {
    bild: "/produkttour/dienste.png",
    breite: 1440,
    hoehe: 860,
    titel: "Offene Dienste fair verteilen",
    text: "Wer hat schon wie oft gepfiffen oder Kiosk/Ordnerdienst übernommen? Die Statistik zeigt die Verteilung, offene Termine sind sofort sichtbar.",
  },
];

// Suchmaschinen und KI-Assistenten (Titel, Beschreibung, kanonische Adresse): gezielt auf die Begriffe, mit denen Vereine suchen.
export const metadata: Metadata = {
  title: { absolute: "HandballerPate – Hallenspielplan, Spielplan & Dienste für Handballvereine" },
  description:
    "Schiedsrichter, Zeitnehmer, Ordner und Kiosk einteilen, Hallenspielplan aus nuLiga und handball.net automatisch übernehmen, Spielpläne und Ergebnisse als App für Spieler und Eltern. Für Handballvereine.",
  alternates: { canonical: "/" },
};

// Häufige Fragen: sichtbar auf der Seite UND als FAQPage-Daten (JSON-LD) — so finden und zitieren Suchmaschinen und KI-Assistenten die Antworten.
function faqEintraege(live: boolean) {
  return [
    {
      frage: "Was ist HandballerPate?",
      antwort:
        "HandballerPate ist eine Plattform für Handballvereine. Vereine verwalten ihre Funktionsträger (Schiedsrichter, Zeitnehmer, Sekretäre, Ordner, Kioskdienst, Kassierer, Trainer), teilen Einsätze fair ein und übernehmen den Hallenspielplan automatisch aus nuLiga oder handball.net. Spieler, Eltern und Fans sehen Spielpläne, Ergebnisse und Tabellen ihres Vereins als App.",
    },
    {
      frage: "Welche Verbände und Ligen werden unterstützt?",
      antwort:
        "Über nuLiga der Hessische Handball-Verband (HHV) und der Handball-Verband Berlin (HVBerlin), weitere nuLiga-Verbände auf Anfrage. Über handball.net alle DHB-Wettbewerbe ab der 3. Liga, inklusive Jugendbundesliga. Die 1. und 2. Handball-Bundesliga kommen über den NDR.",
    },
    {
      frage: "Was kostet HandballerPate?",
      antwort: live
        ? `HandballerPate kostet ${PREIS_REGULAER} € netto pro Jahr (zzgl. gesetzlicher MwSt.). Die Rechnung kommt per E-Mail, das Zahlungsziel beträgt 30 Tage.`
        : `Die Beta-Phase läuft voraussichtlich bis ${BETA_ENDE} und ist kostenlos. Wer in der Beta dabei ist, zahlt danach ${PREIS_BETA} € statt ${PREIS_REGULAER} € netto pro Jahr (zzgl. gesetzlicher MwSt.). Vor dem Ende der Beta kann jeder Verein ohne Kosten aussteigen, dann werden alle Daten gelöscht.`,
    },
    {
      frage: "Müssen sich Spieler und Eltern registrieren?",
      antwort:
        "Nein. Spielplan, Ergebnisse und Tabellen sind ohne Login sichtbar, und die Seite des Vereins lässt sich als App aufs Handy installieren. Favoriten werden nur im eigenen Browser gespeichert, es gibt kein Konto und kein Tracking.",
    },
    {
      frage: "Wie tragen sich Eltern für Dienste ein?",
      antwort:
        "Der Zeitnehmerwart oder Ordnerwart schaltet einen Link frei. Darüber wählen Eltern und Helfer ohne Login ihre Termine und tragen sich als Zeitnehmer, Sekretär, Ordner, Kioskdienst oder Kassierer ein. Mit einer E-Mail-Adresse entsteht auf Wunsch ein eigener Zugang mit Kalender und Erinnerungen.",
    },
    {
      frage: "Wie steht es um den Datenschutz?",
      antwort:
        "Die Daten der Vereine sind strikt voneinander getrennt. Ein Auftragsverarbeitungsvertrag und die Datenschutzerklärung liegen von Anfang an bei. Von nuLiga und handball.net werden nur öffentliche Sport-Daten übernommen, keine Personendaten wie Schiedsrichter-Namen.",
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
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, iOS, Android (als installierbare Web-App)",
        inLanguage: "de-DE",
        description:
          "Plattform für Handballvereine: Funktionsträger verwalten, Einsätze einteilen, Hallenspielplan aus nuLiga und handball.net übernehmen, Spielpläne und Ergebnisse als App.",
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

  const { betaVereinLimit } = await holeSystemEinstellungen();
  const vereineCount = await zaehleVereineFuerBetaLimit();
  const live = betaVorbei(new Date()); // nach dem Beta-Ende ist die Registrierung kostenpflichtig
  const freiePlaetze = Math.max(betaVereinLimit - vereineCount, 0);
  // Vereine mit öffentlicher Seite (Spielpläne/Ergebnisse) — stehen vor dem Beta-Hinweis.
  const vereineMitSeite = await holeAlleVereine();

  const faq = faqEintraege(live);

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(startseiteJsonLd(live)).replace(/</g, "\\u003c") }}
      />
      {/* Oben bewusst NUR der Login-Zugang (kein Registrieren-Button) —
          wiederkehrende Funktionsträger/Admins wollen direkt einloggen,
          ohne erst an der Beta-Werbung vorbeiklicken zu müssen. Der
          Registrieren-Weg lebt stattdessen prominent im Hero unten und im
          Footer (siehe components/footer.tsx). */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Logo className="size-8" />
            <span className="font-heading font-semibold">HandballerPate</span>
          </div>
          <Button
            variant="outline"
            className="h-12 px-6 text-base transition-transform active:scale-[0.97]"
            render={<Link href="/login" />}
            nativeButton={false}
          >
            Login
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-16 text-center">
          <Badge variant="secondary" className="hero-rein h-7 px-3 text-sm">{live ? `${PREIS_REGULAER} € netto im Jahr` : "Beta · 100% kostenlos"}</Badge>
          <h1 style={{ ["--hero-verzoegerung" as string]: "100ms" }} className="hero-rein font-heading text-4xl font-semibold text-balance sm:text-5xl">
            Die Vereinsverwaltung für euren Handballspielbetrieb
          </h1>
          <p style={{ ["--hero-verzoegerung" as string]: "220ms" }} className="hero-rein max-w-xl text-lg text-muted-foreground text-balance">
            Funktionsträger, Hallenspielplan und Einsatzplanung an einem Ort
            — automatisch synchron mit nuLiga bzw. handball.net, statt
            Excel-Listen und WhatsApp-Nachrichten hinterherzutelefonieren.
          </p>
          <div style={{ ["--hero-verzoegerung" as string]: "340ms" }} className="hero-rein flex flex-wrap items-center justify-center gap-3">
            <Button className={GROSSER_BUTTON} render={<Link href="/registrieren" />} nativeButton={false}>
              {live ? "Jetzt registrieren" : "Jetzt kostenlos registrieren"}
            </Button>
          </div>
          <Link
            href="#vereine"
            style={{ ["--hero-verzoegerung" as string]: "460ms" }}
            className="hero-rein inline-flex min-h-14 items-center gap-2 rounded-full border px-7 text-lg font-medium transition hover:bg-muted active:scale-[0.97]"
          >
            <SmartphoneIcon className="size-6 text-primary" />
            Euren Verein als App finden
          </Link>
          {!live && (
            <p className="text-sm text-muted-foreground">
              {freiePlaetze > 0
                ? `Noch ${freiePlaetze} von ${betaVereinLimit} Beta-Plätzen frei — danach Warteliste.`
                : "Die Beta-Plätze sind gerade ausgeschöpft — Registrierung landet auf der Warteliste."}
            </p>
          )}
          <div className="max-w-xl space-y-1 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            {live ? (
              <p>
                <span className="font-medium text-foreground">{PREIS_REGULAER} € im Jahr.</span> Rechnung per E-Mail, Zahlungsziel 30 Tage.
              </p>
            ) : (
              <>
                <p>
                  <span className="font-medium text-foreground">Beta bis voraussichtlich {BETA_ENDE}.</span> Wer in der Beta-Phase dabei ist,
                  zahlt danach nur {PREIS_BETA} € statt {PREIS_REGULAER} € im Jahr.
                </p>
              </>
            )}
            <p className="text-xs">{NETTO}</p>
          </div>
        </section>

        {/* Die öffentlichen Vereinsseiten (direkt unter dem Hero): Spielpläne, Ergebnisse
            und Mannschaften ohne Login — für Spieler, Eltern und Fans. */}
        <section id="vereine" className="scroll-mt-4 border-t bg-muted/30">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-10">
            <div>
              <h2 className="font-heading text-2xl font-semibold">Spielpläne &amp; Ergebnisse</h2>
              <p className="text-sm text-muted-foreground">
                Euren Verein finden: Mannschaften, nächste Spiele, Ergebnisse und Live-Ticker, ohne Login — und als App aufs
                Handy installieren (im Browser „Teilen“ → „Zum Home-Bildschirm“).
              </p>
            </div>
            {vereineMitSeite.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Vereine freigeschaltet.</p>
            ) : (
              <Vereinsuche vereine={vereineMitSeite} maxAnzeige={4} />
            )}
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-heading text-2xl font-semibold">
              Was HandballerPate kann
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Einblenden key={f.titel} verzoegerung={(i % 3) * 100} className="h-full">
                  <div className="group flex h-full flex-col gap-2 rounded-lg border bg-background p-4 transition duration-200 hover:-translate-y-1 hover:shadow-md">
                    <f.icon className="size-6 text-primary transition-transform duration-200 group-hover:scale-110" />
                    <p className="font-heading font-medium">{f.titel}</p>
                    <p className="text-sm text-muted-foreground">{f.text}</p>
                  </div>
                </Einblenden>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
              <h2 className="font-heading text-2xl font-semibold">
                So sieht HandballerPate in der Praxis aus
              </h2>
              <p className="text-sm text-muted-foreground">
                Mit Beispieldaten eines fiktiven Vereins — kein Login nötig,
                um euch ein Bild zu machen.
              </p>
            </div>
            <div className="mt-10 flex flex-col gap-14">
              {PRODUKTTOUR.map((eintrag, i) => (
                <Einblenden
                  key={eintrag.bild}
                  className="grid items-center gap-6 md:grid-cols-2 md:gap-10"
                >
                  <div
                    className={
                      i % 2 === 1 ? "order-1 md:order-2" : "order-1"
                    }
                  >
                    <ProdukttourBild
                      src={eintrag.bild}
                      alt={eintrag.titel}
                      breite={eintrag.breite}
                      hoehe={eintrag.hoehe}
                    />
                  </div>
                  <div
                    className={
                      i % 2 === 1
                        ? "order-2 flex flex-col gap-2 md:order-1"
                        : "order-2 flex flex-col gap-2"
                    }
                  >
                    <h3 className="font-heading text-lg font-medium">
                      {eintrag.titel}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {eintrag.text}
                    </p>
                  </div>
                </Einblenden>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16">
            <h2 className="font-heading text-2xl font-semibold">
              Was bedeutet &bdquo;Beta&ldquo;?
            </h2>
            <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <ShieldCheckIcon className="size-5 shrink-0 text-primary" />
                {live ? `${PREIS_REGULAER} € netto im Jahr, keine versteckten Kosten.` : "Aktuell komplett kostenlos, keine versteckten Kosten."}
              </li>
              {!live && (
                <li className="flex gap-3">
                  <ShieldCheckIcon className="size-5 shrink-0 text-primary" />
                  {KEIN_RISIKO}
                </li>
              )}
              <li className="flex gap-3">
                <UsersIcon className="size-5 shrink-0 text-primary" />
                Auf {betaVereinLimit} Vereine begrenzt, damit wir eng am
                Feedback bleiben können — danach geht es auf die Warteliste,
                bis ein Platz frei wird.
              </li>
              <li className="flex gap-3">
                <MessageCircleIcon className="size-5 shrink-0 text-primary" />
                Direktes Feedback jederzeit über den Feedback-Button im
                Header, sobald ihr eingeloggt seid.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground">{SPONSOR_KURZ}</p>
            <div>
              <Button className={GROSSER_BUTTON} render={<Link href="/registrieren" />} nativeButton={false}>
                Verein registrieren
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30" aria-labelledby="faq-titel">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16">
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
