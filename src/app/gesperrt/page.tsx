import { auth, signOut } from "@/auth";
import { adminDb } from "@/db/admin";
import { eq } from "drizzle-orm";
import { vereine } from "@/db/schema";
import { zahlungsStand } from "@/lib/abrechnung";
import { NETTO, PREIS_REGULAER } from "@/lib/beta-konditionen";
import { formatDatum } from "@/lib/format";
import { weiternutzungBestaetigen } from "./actions";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KONTAKT_EMAIL } from "@/lib/beta-konditionen";

export const metadata = { title: "Zugang gesperrt", robots: { index: false } };

// Bewusst OHNE requireSession (sonst Endlosschleife: requireSession leitet hierher). Wer nicht eingeloggt ist, sieht nur den neutralen Hinweis.
export default async function GesperrtSeite() {
  // Testphase vorbei? Dann kann der Vereinsadmin hier ausdrücklich weitermachen (keine automatische Zahlungspflicht).
  const u = (await auth())?.user;
  const verein = u?.vereinId ? await adminDb.query.vereine.findFirst({ where: eq(vereine.id, u.vereinId) }) : null;
  const testAbgelaufen = !!verein && zahlungsStand(verein, new Date()).art === "testphase_abgelaufen";
  if (testAbgelaufen && verein) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <Logo className="mb-1 size-10 text-primary" />
            <CardTitle className="text-xl">Eure Testphase ist abgelaufen</CardTitle>
            <CardDescription>
              Die 14 kostenlosen Tage von {verein.name} sind vorbei. Eure Daten bleiben erhalten. Zahlen müsst ihr nichts, solange ihr nicht ausdrücklich weitermacht.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">{PREIS_REGULAER} € im Jahr</span> (12 Monate). {NETTO}
              </li>
              <li>Rechnung per E-Mail an {verein.rechnungEmail ?? "die Admin-E-Mail-Adresse"}, Zahlungsziel 30 Tage.</li>
              <li>Optional kann ein Sponsor die Kosten übernehmen („Präsentiert von …“ auf der Vereinsseite).</li>
            </ul>
            {u?.istAdmin && !u.treuhand ? (
              <form action={weiternutzungBestaetigen} className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Mit dem Klick bestätigt ihr die kostenpflichtige Nutzung zu diesen Konditionen ab {formatDatum(new Date())}.
                </p>
                <SubmitButton className="w-full">Ich möchte HandballerPate weiterhin nutzen</SubmitButton>
              </form>
            ) : (
              <p className="text-muted-foreground">Bitte euren Vereinsadmin, die Weiternutzung zu bestätigen.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Ihr wollt nicht weitermachen? Dann müsst ihr nichts tun; auf Wunsch löschen wir euren Verein ({KONTAKT_EMAIL}).
            </p>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <SubmitButton variant="outline" className="w-full">
                Abmelden
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Logo className="mb-1 size-10 text-primary" />
          <CardTitle className="text-xl">Zugang gesperrt</CardTitle>
          <CardDescription>
            Der Zugang für euren Verein ist gesperrt, weil die Zahlung noch aussteht. Eure Daten bleiben erhalten. Sobald die Zahlung eingegangen ist, wird der
            Zugang wieder freigeschaltet. Fragen zur Rechnung bitte an{" "}
            <a href={`mailto:${KONTAKT_EMAIL}`} className="underline underline-offset-2">
              {KONTAKT_EMAIL}
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <SubmitButton variant="outline" className="w-full">
              Abmelden
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
