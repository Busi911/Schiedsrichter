import { eq, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { KopfLogo } from "@/components/kopf-logo";
import { holeVereinsLogoInfo } from "@/lib/vereins-logo";
import { LinkSpinner } from "@/components/link-spinner";
import { TerminMehrfachAuswahl, type EintragbarerTermin } from "@/components/mehrfachauswahl";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ladeEintragungsTermine, rollenGruppenFuer } from "@/lib/eintragung-termine";
import { eintragenMehrfach, loginLinkAnfordern } from "./actions";

// Token-Seite: nie in Suchmaschinen/KI-Antworten (zusätzlich zu robots.txt).
export const metadata: Metadata = { title: "Für Dienste eintragen", robots: { index: false, follow: false } };

// EINE öffentliche Eintragungsseite für alle Dienste (Zeitnehmer/Sekretär, Ordner, Kioskdienst, Kassierer). Was angeboten wird, schalten die
// Warte frei: Zeitnehmerwart bzw. Ordnerwart aktivieren je einen login-freien Link (Token am Verein). Kenntnis eines der Tokens ist die
// Berechtigung; angeboten werden die Gruppen, deren Token gerade aktiv ist. Die früheren Adressen /zeitnehmer-eintragen/… und
// /ordner-eintragen/… leiten mit demselben Token hierher um (bestehende Links bleiben gültig).
//
// Wird eine passende Session zu diesem Verein erkannt, entfällt die Namens-/E-Mail-Eingabe (die Aktion nimmt die Identität aus der Session).
export default async function EintragenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mannschaft?: string }>;
}) {
  const { token } = await params;
  const { mannschaft: mannschaftFilter } = await searchParams;

  const verein = await adminDb.query.vereine.findFirst({
    where: or(eq(vereine.zeitnehmerSelbstanmeldungToken, token), eq(vereine.ordnerSelbstanmeldungToken, token)),
  });
  if (!verein) notFound();

  const aktiv = { zeitnehmer: !!verein.zeitnehmerSelbstanmeldungToken, ordner: !!verein.ordnerSelbstanmeldungToken };
  const rollenGruppen = rollenGruppenFuer(aktiv);

  // Nur eine Session, die zu GENAU diesem Verein gehört, macht aus der Seite die "eingeloggt"-Ansicht (eine fremde bleibt anonym).
  const session = await auth();
  const eingeloggtePerson = session?.user?.vereinId === verein.id ? { name: session.user.name ?? session.user.email ?? "" } : null;

  const { alleMannschaften, termine } = await ladeEintragungsTermine(verein, aktiv);
  const vereinsLogo = await holeVereinsLogoInfo(verein.id);

  // Nur Mannschaften als Filter anbieten, die auch mindestens einen eintragbaren Termin haben.
  const mannschaftenMitTerminen = new Set(termine.map((t) => t.mannschaftId).filter((id): id is string => !!id));
  const anzeigbareMannschaften = alleMannschaften.filter((m) => mannschaftenMitTerminen.has(m.id));
  const gefilterteTermine = mannschaftFilter ? termine.filter((t) => t.mannschaftId === mannschaftFilter) : termine;

  const eintragbareTermine: EintragbarerTermin[] = gefilterteTermine;
  const offeneAnzahl = gefilterteTermine.filter((t) => !t.vollstaendig).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <KopfLogo logo={vereinsLogo} className="size-12" />
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{verein.name}</p>
          <h1 className="font-heading text-2xl font-semibold">Für Dienste eintragen</h1>
        </div>
      </div>

      {eingeloggtePerson ? (
        <p className="text-base text-muted-foreground">
          Angemeldet als <strong>{eingeloggtePerson.name}</strong> — Termine antippen und eintragen, Name und E-Mail sind schon bekannt.
        </p>
      ) : (
        <>
          <p className="text-base text-muted-foreground">
            Kein Login nötig: Namen angeben, Termine antippen, eintragen. Bereits im System angelegte Personen werden automatisch erkannt — bei
            Unsicherheit prüft der zuständige Wart nach.
          </p>
          {/* Login direkt hier anfordern: der Link in der Mail führt wieder auf diese Seite zurück, ohne Namenseingabe. */}
          <Card className="border-primary/40 bg-primary/5">
            <CardContent>
              <form action={loginLinkAnfordern} className="flex flex-col gap-3">
                <input type="hidden" name="token" value={token} />
                <p className="text-base font-semibold">Schon einen Zugang? Dann geht es schneller.</p>
                <p className="text-sm text-muted-foreground">
                  Wir schicken euch einen Login-Link per E-Mail. Danach kommt ihr hierher zurück, ohne Namen und E-Mail erneut einzutippen.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="login-email" className="text-base">
                    E-Mail-Adresse
                  </Label>
                  <Input id="login-email" name="email" type="email" required placeholder="name@verein.de" autoComplete="email" className="h-12 px-3" />
                </div>
                <SubmitButton className="h-12 text-base" pendingText="Wird gesendet…">
                  Login-Link senden
                </SubmitButton>
                <Link
                  href={`/login?redirect=${encodeURIComponent(`/eintragen/${token}`)}`}
                  className="inline-flex min-h-11 items-center justify-center text-base underline"
                >
                  Lieber mit Passwort einloggen
                </Link>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {gefilterteTermine.length > 0 && (
        <p className="text-base font-medium">
          {offeneAnzahl} von {gefilterteTermine.length} {gefilterteTermine.length === 1 ? "Termin" : "Terminen"} noch nicht vollständig besetzt
        </p>
      )}

      {anzeigbareMannschaften.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant={!mannschaftFilter ? "default" : "outline"} className="h-11 px-4 text-base" render={<Link href="?" />} nativeButton={false}>
            Alle
            <LinkSpinner />
          </Button>
          {anzeigbareMannschaften.map((m) => (
            <Button
              key={m.id}
              variant={mannschaftFilter === m.id ? "default" : "outline"}
              className="h-11 px-4 text-base"
              render={<Link href={`?mannschaft=${m.id}`} />}
              nativeButton={false}
            >
              {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
              <LinkSpinner />
            </Button>
          ))}
        </div>
      )}

      {gefilterteTermine.length === 0 ? (
        <p className="text-base text-muted-foreground">Keine anstehenden Termine.</p>
      ) : (
        <TerminMehrfachAuswahl
          token={token}
          termine={eintragbareTermine}
          rollenGruppen={rollenGruppen}
          submitAction={eintragenMehrfach}
          eingeloggtAls={eingeloggtePerson?.name}
          zeigeEmailFeld={!eingeloggtePerson}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">Selbsteintragung — HandballerPate</p>
    </main>
  );
}
