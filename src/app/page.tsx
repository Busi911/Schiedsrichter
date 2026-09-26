import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClockIcon,
  ClipboardCheckIcon,
  MailCheckIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen flex-col items-center gap-12 p-6 py-16">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Logo className="mb-1 size-10 text-primary" />
            <CardTitle className="text-xl">HandballerPate</CardTitle>
            <CardDescription>
              Verwaltungsplattform für Funktionsträger im Handballverein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              className="w-full"
            >
              Login
            </Button>
          </CardContent>
        </Card>

        <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </main>
    );
  }

  if (session.user.istSystemAdmin) redirect("/system");
  redirect(
    session.user.istAdmin || session.user.istAdminLesend ? "/admin" : "/profil"
  );
}
