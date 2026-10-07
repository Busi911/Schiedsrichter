import { signOut } from "@/auth";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KONTAKT_EMAIL } from "@/lib/beta-konditionen";

export const metadata = { title: "Zugang gesperrt", robots: { index: false } };

// Bewusst OHNE requireSession (sonst Endlosschleife: requireSession leitet hierher). Wer nicht eingeloggt ist, sieht nur den neutralen Hinweis.
export default function GesperrtSeite() {
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
