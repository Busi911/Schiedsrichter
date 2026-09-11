import { eq } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften } from "@/db/schema";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { holeUnbekannteMannschaften } from "@/lib/unbekannte-mannschaften";
import {
  handballNetSynchronisieren,
  ignorierteMannschaftReaktivieren,
  mannschaftAusRundenspielAnlegen,
  mannschaftBedarfRolleUmschalten,
  unbekannteMannschaftAblehnen,
} from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MannschaftenTabelle } from "@/components/mannschaften-tabelle";
import { NeueMannschaftDialog } from "@/components/neue-mannschaft-dialog";
import { SubmitButton } from "@/components/submit-button";

const BEDARF_ROLLEN = [
  { wert: "ordner", label: "Ordner" },
  { wert: "kioskdienst", label: "Kioskdienst" },
  { wert: "kassierer", label: "Kassierer" },
  { wert: "zeitnehmer", label: "Zeitnehmer/Sekretär" },
] as const;

function istRolleDeaktiviert(
  m: {
    ordnerBedarfDeaktiviert: boolean;
    kioskdienstBedarfDeaktiviert: boolean;
    kassiererBedarfDeaktiviert: boolean;
    zeitnehmerBedarfDeaktiviert: boolean;
  },
  rolle: (typeof BEDARF_ROLLEN)[number]["wert"]
): boolean {
  if (rolle === "ordner") return m.ordnerBedarfDeaktiviert;
  if (rolle === "kioskdienst") return m.kioskdienstBedarfDeaktiviert;
  if (rolle === "kassierer") return m.kassiererBedarfDeaktiviert;
  return m.zeitnehmerBedarfDeaktiviert;
}

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

  const [rohListe, { unbekannteMannschaften, ignoriert }] = await Promise.all([
    withTenant(vereinId, (tx) =>
      tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, vereinId),
        orderBy: (m, { asc }) => [asc(m.name)],
      })
    ),
    holeUnbekannteMannschaften(vereinId),
  ]);
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

      {session.user.istAdmin && unbekannteMannschaften.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Unbekannte Mannschaften</CardTitle>
            <CardDescription>
              Heim-/Auswärtsnamen aus dem Hallenspielplan-Import (siehe
              /admin/termine), die noch keiner Mannschaft zugeordnet sind —
              sortiert nach Häufigkeit. Bereits importierte Spiele werden
              beim Anlegen rückwirkend verknüpft.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <strong>Nur eure eigenen Mannschaften anlegen.</strong> Die
              Halle wird auch von anderen Vereinen bespielt — deren
              Mannschaften tauchen hier zwangsläufig mit auf und sollten
              per &bdquo;Ablehnen&ldquo; entfernt werden, statt sie zu
              &uuml;berspringen (sonst erscheinen sie bei jedem weiteren
              Import erneut).
            </div>
            <div className="flex flex-col divide-y">
              {unbekannteMannschaften.map((m) => (
                <form
                  key={`${m.normalisiert}::${m.kategorie ?? ""}`}
                  action={mannschaftAusRundenspielAnlegen}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <input type="hidden" name="name" value={m.anzeigeName} />
                  <input type="hidden" name="kategorie" value={m.kategorie ?? ""} />
                  <span className="text-sm">
                    {m.anzeigeName}
                    {m.kategorie && (
                      <span className="text-muted-foreground"> ({m.kategorie})</span>
                    )}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({m.anzahlSpiele} {m.anzahlSpiele === 1 ? "Spiel" : "Spiele"})
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      formAction={unbekannteMannschaftAblehnen}
                      variant="ghost"
                      size="sm"
                    >
                      Ablehnen
                    </Button>
                    <Button type="submit" variant="outline" size="sm">
                      Als Mannschaft anlegen
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {session.user.istAdmin && ignoriert.length > 0 && (
        // Standardmäßig eingeklappt und bewusst dezent (nur eine kleine,
        // graue Zeile statt einer vollen Karten-Überschrift) — anders als
        // "Unbekannte Mannschaften" oben ist das hier kein aktiver
        // Handlungsbedarf, sondern nur eine bei Bedarf einsehbare
        // Rückgängig-Möglichkeit für längst erledigte Ablehnungen.
        <details className="group max-w-2xl">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
            Abgelehnte Mannschaften ({ignoriert.length})
          </summary>
          <Card className="mt-2">
            <CardHeader>
              <CardDescription>
                Per &bdquo;Ablehnen&ldquo; oben bewusst nicht als eigene
                Mannschaft angelegt — meist Gegner-Mannschaften an der
                eigenen Halle. Deren Termine zählen deshalb nirgends als
                offener Dienst (siehe /admin, /admin/dienste). Rückgängig
                macht den Vorschlag wieder sichtbar, falls noch
                unverknüpfte Termine dafür bestehen.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {ignoriert.map((i) => (
                <form
                  key={i.id}
                  action={ignorierteMannschaftReaktivieren}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <input type="hidden" name="id" value={i.id} />
                  <span className="text-sm">
                    {i.normalisierterName}
                    {i.kategorie && (
                      <span className="text-muted-foreground"> ({i.kategorie})</span>
                    )}
                  </span>
                  <Button type="submit" variant="ghost" size="sm">
                    Rückgängig
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>
        </details>
      )}

      {session.user.istAdmin && liste.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bedarf pro Mannschaft</CardTitle>
            <CardDescription>
              Zentrale Übersicht über die sonst auf den jeweiligen
              Wart-Seiten verteilten Bedarf-Abschaltungen (z.B. für
              Jugend-Mannschaften ohne eigene Heimspiele mit Publikum) —
              wirkt live auf alle Termine dieser Mannschaft, auch bereits
              bestehende offene.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mannschaft</TableHead>
                  {BEDARF_ROLLEN.map((r) => (
                    <TableHead key={r.wert}>{r.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
                    </TableCell>
                    {BEDARF_ROLLEN.map((r) => {
                      const deaktiviert = istRolleDeaktiviert(m, r.wert);
                      return (
                        <TableCell key={r.wert}>
                          <form action={mannschaftBedarfRolleUmschalten}>
                            <input type="hidden" name="mannschaftId" value={m.id} />
                            <input type="hidden" name="rolle" value={r.wert} />
                            <Button
                              type="submit"
                              size="xs"
                              variant={deaktiviert ? "outline" : "secondary"}
                            >
                              {deaktiviert ? "deaktiviert" : "aktiv"}
                            </Button>
                          </form>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
