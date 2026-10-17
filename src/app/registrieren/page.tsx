import Link from "next/link";
import { BETA_KURZ, KEIN_RISIKO, NETTO, SPONSOR_KURZ, TESTPHASE_KURZ } from "@/lib/beta-konditionen";
import { betaVorbei } from "@/lib/abrechnung";
import { betaPlaetzeSatz } from "@/lib/beta-plaetze";
import { holeBetaStand } from "@/lib/system-einstellungen";
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

// Rein informativ ("noch X Plätze frei") — ob Beta oder kostenpflichtig,
// entscheidet die Action nochmal selbst (siehe Kommentar dort), nicht diese
// beim Rendern berechnete Zahl.
export default async function RegistrierenPage() {
  const beta = await holeBetaStand();
  // Nach dem Beta-Ende oder wenn alle Beta-Plätze vergeben sind, ist die Registrierung kostenpflichtig (Preis, Rechnung, Rechnungs-E-Mail Pflicht).
  const betaEnde = betaVorbei(new Date());
  const kostenpflichtig = betaEnde || beta.voll;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-1 size-10 text-primary" />
          <CardTitle className="text-xl">Verein registrieren</CardTitle>
          <CardDescription>
            {kostenpflichtig
              ? `${TESTPHASE_KURZ} ${NETTO} ${SPONSOR_KURZ}`
              : `HandballerPate befindet sich in der Beta und ist aktuell komplett kostenlos. ${BETA_KURZ} ${KEIN_RISIKO}`}{" "}
            {kostenpflichtig ? (betaEnde ? "" : "Alle Beta-Plätze sind vergeben.") : betaPlaetzeSatz(beta.frei)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrierenFormular kostenpflichtig={kostenpflichtig} />
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
