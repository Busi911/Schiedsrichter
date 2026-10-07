import Link from "next/link";
import { BETA_KURZ } from "@/lib/beta-konditionen";
import { holeSystemEinstellungen, zaehleVereineFuerBetaLimit } from "@/lib/system-einstellungen";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { RegistrierenFormular } from "./formular";

export const metadata = { title: "Verein registrieren – HandballerPate" };

// Ohne Session/cookies()-Zugriff hätte Next.js diese Seite sonst statisch
// vorgerendert (kein Login-Zwang, der das automatisch dynamisch machen
// würde) — die "noch X Plätze frei"-Zahl wäre dann für die gesamte
// Deploy-Lebensdauer eingefroren statt bei jedem Aufruf aktuell.
export const dynamic = "force-dynamic";

// Rein informativ ("noch X Plätze frei") — der tatsächliche
// Limit-Vergleich, der über Registrierung vs. Warteliste entscheidet,
// läuft nochmal serverseitig in der Action selbst (siehe Kommentar dort),
// nicht auf Basis dieser beim Rendern berechneten Zahl.
export default async function RegistrierenPage() {
  const { betaVereinLimit } = await holeSystemEinstellungen();
  const vereineCount = await zaehleVereineFuerBetaLimit();
  const freiePlaetze = Math.max(betaVereinLimit - vereineCount, 0);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-1 size-10 text-primary" />
          <CardTitle className="text-xl">Verein registrieren</CardTitle>
          <CardDescription>
            HandballerPate befindet sich in der Beta und ist aktuell
            komplett kostenlos. {BETA_KURZ}{" "}
            {freiePlaetze > 0
              ? `Noch ${freiePlaetze} von ${betaVereinLimit} Plätzen frei.`
              : "Die Beta-Plätze sind aktuell ausgeschöpft — ihr landet auf der Warteliste und werdet benachrichtigt, sobald ein Platz frei wird."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrierenFormular />
        </CardContent>
      </Card>
      <Link
        href="/login"
        className="mt-4 text-sm text-muted-foreground underline"
      >
        Schon registriert? Zum Login
      </Link>
    </main>
  );
}
