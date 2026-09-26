import Link from "next/link";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import {
  CalendarClockIcon,
  ClipboardCheckIcon,
  MailCheckIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const FEATURES = [
  {
    icon: UsersIcon,
    titel: "Funktionsträger zentral verwalten",
    text: "Schiedsrichter, Zeitnehmer, Sekretäre, Ordner, Kioskdienst, Kassierer und Trainer an einem Ort — inklusive Excel-Import.",
  },
  {
    icon: RefreshCwIcon,
    titel: "Hallenspielplan automatisch synchron",
    text: "Liga-Pflichtspiele kommen automatisch aus nuLiga bzw. handball.net (ab 3. Liga) — inklusive Ergebnissen und Verlegungen.",
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
  const [{ value: vereineCount }] = await adminDb.select({ value: count() }).from(vereine);
  const freiePlaetze = Math.max(betaVereinLimit - vereineCount, 0);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Oben bewusst NUR der Login-Zugang (kein Registrieren-Button) —
          wiederkehrende Funktionsträger/Admins wollen direkt einloggen,
          ohne erst an der Beta-Werbung vorbeiklicken zu müssen. Der
          Registrieren-Weg lebt stattdessen prominent im Hero unten und im
          Footer (siehe components/footer.tsx). */}
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Logo className="size-7 text-primary" />
            <span className="font-heading font-semibold">HandballerPate</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/login" />}
            nativeButton={false}
          >
            Login
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-20 text-center">
          <Badge variant="secondary">Beta · 100% kostenlos</Badge>
          <h1 className="font-heading text-4xl font-semibold text-balance sm:text-5xl">
            Die Vereinsverwaltung für euren Handballspielbetrieb
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-balance">
            Funktionsträger, Hallenspielplan und Einsatzplanung an einem Ort
            — automatisch synchron mit nuLiga bzw. handball.net, statt
            Excel-Listen und WhatsApp-Nachrichten hinterherzutelefonieren.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" render={<Link href="/registrieren" />} nativeButton={false}>
              Jetzt kostenlos registrieren
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/login" />}
              nativeButton={false}
            >
              Login
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {freiePlaetze > 0
              ? `Noch ${freiePlaetze} von ${betaVereinLimit} Beta-Plätzen frei — danach Warteliste.`
              : "Die Beta-Plätze sind gerade ausgeschöpft — Registrierung landet auf der Warteliste."}
          </p>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-heading text-2xl font-semibold">
              Was HandballerPate kann
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.titel}
                  className="flex flex-col gap-2 rounded-lg border bg-background p-4"
                >
                  <f.icon className="size-6 text-primary" />
                  <p className="font-heading font-medium">{f.titel}</p>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
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
                Aktuell komplett kostenlos, keine versteckten Kosten.
              </li>
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
            <div>
              <Button render={<Link href="/registrieren" />} nativeButton={false}>
                Verein registrieren
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
