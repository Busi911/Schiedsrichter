import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften } from "@/db/schema";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { handballNetSynchronisieren } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MannschaftenTabelle } from "@/components/mannschaften-tabelle";
import { NeueMannschaftDialog } from "@/components/neue-mannschaft-dialog";
import { SubmitButton } from "@/components/submit-button";

export default async function MannschaftenPage({
  searchParams,
}: {
  searchParams: Promise<{
    hnNeu?: string;
    hnAktualisiert?: string;
    hnEntfernt?: string;
    hnFehler?: string;
    hnDiagnose?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const hnErgebnis = await searchParams;

  const rohListe = await withTenant(vereinId, (tx) =>
    tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    })
  );
  // Alphabetisch (DB-orderBy oben) würde z.B. "A-Jugend" vor "Herren 1"
  // einsortieren — die Vereins-übliche Reihenfolge (Männer, Frauen, Jugend
  // A-E, Mini/Maxi) kommt aus dem Namen selbst, siehe mannschaft-sortierung.ts.
  const liste = sortiereMannschaften(rohListe);
  const anzahlMitTeamId = liste.filter((m) => m.handballNetTeamId).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Mannschaften</h1>
        <p className="text-sm text-muted-foreground">
          Mannschaften des Vereins verwalten.
        </p>
      </div>

      {hnErgebnis.hnNeu !== undefined && (
        <Alert
          variant={hnErgebnis.hnFehler ? "destructive" : "default"}
          className="max-w-md"
        >
          <AlertTitle>
            handball.net-Sync: {hnErgebnis.hnNeu} neu,{" "}
            {hnErgebnis.hnAktualisiert ?? 0} aktualisiert,{" "}
            {hnErgebnis.hnEntfernt ?? 0} entfernt
          </AlertTitle>
          {(hnErgebnis.hnFehler || hnErgebnis.hnDiagnose) && (
            <AlertDescription>
              {hnErgebnis.hnFehler?.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
              {hnErgebnis.hnDiagnose && (
                <p className="text-xs text-muted-foreground">{hnErgebnis.hnDiagnose}</p>
              )}
            </AlertDescription>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alle Mannschaften</CardTitle>
          {session.user.istAdmin && (
            <CardAction>
              <NeueMannschaftDialog />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <MannschaftenTabelle
            liste={liste}
            schreibzugriff={session.user.istAdmin}
          />
        </CardContent>
      </Card>

      {session.user.istAdmin && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>handball.net-Sync</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Ab der 3. Liga läuft der Spielbetrieb zentral über
              handball.net statt über den Landesverband — solche
              Mannschaften brauchen oben ihre handball.net-Team-ID statt
              (bzw. zusätzlich zu) der nuLiga-Hallen-IDs unter
              Einstellungen. Die ID steht in der Adresszeile der
              Team-Seite, z.B. bei <code>handball.net/team/69770</code> ist
              sie <code>69770</code>. Läuft täglich automatisch per Cron;
              nach dem Eintragen einer neuen ID hier sofort synchronisieren.
            </p>
            <form action={handballNetSynchronisieren}>
              <SubmitButton
                className="w-full"
                variant="outline"
                pendingText="Synchronisiert…"
                disabled={anzahlMitTeamId === 0}
              >
                Jetzt synchronisieren ({anzahlMitTeamId}{" "}
                {anzahlMitTeamId === 1 ? "Mannschaft" : "Mannschaften"})
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
