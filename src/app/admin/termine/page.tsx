import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import { spielDuplikatVerknuepfen } from "../actions";
import { findeSpielDuplikate } from "@/lib/duplikat-erkennung";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { formatMannschaft } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NeuerTerminDialog } from "@/components/neuer-termin-dialog";
import { RundenspieleListe } from "@/components/rundenspiele-liste";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
};

const QUELL_TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
};

type Tab = "testspiele" | "rundenspiele";

// Ehemals zwei getrennte Nav-Punkte (/admin/termine, /admin/rundenspiele) —
// beide zeigen letztlich nur Spieltermine an, nur auf unterschiedliche Art
// (manuell angelegt vs. per Import/nuLiga-Sync). Jetzt ein Nav-Punkt mit
// zwei Tabs über den ?tab=-Query-Parameter, damit jeder Tab nur seine
// eigenen Daten lädt statt beide bei jedem Aufruf zu holen.
export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const tab: Tab = (await searchParams).tab === "rundenspiele" ? "rundenspiele" : "testspiele";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Termine</h1>
        <p className="text-sm text-muted-foreground">
          Alle Spieltermine des Vereins — importierte Liga-Pflichtspiele
          (Hallenspielplan) und selbst angelegte Freundschaftsspiele/Turniere.
        </p>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border bg-muted p-1">
        <Link
          href="/admin/termine?tab=testspiele"
          className={cn(
            buttonVariants({
              variant: tab === "testspiele" ? "secondary" : "ghost",
              size: "sm",
            }),
            tab === "testspiele" && "shadow-sm"
          )}
        >
          Freundschaftsspiele &amp; Turniere
        </Link>
        <Link
          href="/admin/termine?tab=rundenspiele"
          className={cn(
            buttonVariants({
              variant: tab === "rundenspiele" ? "secondary" : "ghost",
              size: "sm",
            }),
            tab === "rundenspiele" && "shadow-sm"
          )}
        >
          Hallenspielplan
        </Link>
      </div>

      {tab === "rundenspiele" ? (
        <RundenspieleTab vereinId={vereinId} istAdmin={session.user.istAdmin} />
      ) : (
        <TestspieleTab vereinId={vereinId} istAdmin={session.user.istAdmin} />
      )}
    </div>
  );
}

async function TestspieleTab({
  vereinId,
  istAdmin,
}: {
  vereinId: string;
  istAdmin: boolean;
}) {
  const [liste, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const liste = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          inArray(termine.typ, ["testspiel", "turnier"])
        )
      )
      .orderBy(asc(termine.start));
    const mannschaftsListe = sortiereMannschaften(
      await tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, vereinId),
      })
    );
    return [liste, mannschaftsListe];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alle Termine</CardTitle>
        {istAdmin && (
          <CardAction>
            <NeuerTerminDialog mannschaftsListe={mannschaftsListe} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {liste.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Termine angelegt.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Mannschaft</TableHead>
                <TableHead>Ort</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {liste.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {formatDateTime(t.start)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {TYP_LABEL[t.typ] ?? t.typ}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatMannschaft(t) ?? "—"}
                  </TableCell>
                  <TableCell>{t.ort ?? "—"}</TableCell>
                  <TableCell>{t.beschreibung ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/termine/${t.id}`}
                      className="text-xs text-muted-foreground underline"
                    >
                      Bearbeiten
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function RundenspieleTab({
  vereinId,
  istAdmin,
}: {
  vereinId: string;
  istAdmin: boolean;
}) {
  const liste = await withTenant(vereinId, (tx) =>
    tx
      .select({
        id: termine.id,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        mannschaftName: mannschaften.name,
        heimMannschaftName: termine.heimMannschaftName,
        auswaertsMannschaftName: termine.auswaertsMannschaftName,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel")))
      .orderBy(asc(termine.start))
  );

  const { rundenspielDuplikate, icsDuplikate } = await findeSpielDuplikate(vereinId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Alle Spiele an der eigenen Halle — Liga-Pflichtspiele ebenso wie
        Freundschaftsspiele/Turniere, automatisch aus nuLiga synchronisiert
        (siehe Einstellungen). Inklusive Spiele fremder Mannschaften an der
        eigenen Halle (relevant für Ordner-/Kioskdienst). Noch nicht
        verknüpfte bzw. abgelehnte Mannschaften daraus verwaltet ihr unter
        /admin/mannschaften.
      </p>

      {istAdmin && rundenspielDuplikate.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Mögliche Duplikate</CardTitle>
            <CardDescription>
              Manuell angelegte Freundschaftsspiele/Turnier-Einzelspiele
              (z.B. weil noch kein Schiedsrichter feststand), die
              inzwischen auch über den Hallenspielplan importiert wurden
              (als Liga- oder Freundschaftsspiel, siehe Beschreibung unten)
              — dieselbe Begegnung taucht sonst doppelt im Kalender auf.
              Beim Verknüpfen werden bereits erfasste Zuordnungen
              (Schiedsrichter/Zeitnehmer/Sekretär) auf den
              Hallenspielplan-Eintrag übertragen, das doppelte
              Freundschaftsspiel/Turnier-Einzelspiel wird anschließend
              entfernt. Bei einem Turnier-Einzelspiel bleibt der
              Hallenspielplan-Eintrag danach im Turnier sichtbar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {rundenspielDuplikate.map((d) => (
                <div
                  key={`${d.quellId}-${d.rundenspielId}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm">
                    <p>
                      <strong>{QUELL_TYP_LABEL[d.quellTyp] ?? d.quellTyp}:</strong>{" "}
                      {formatDateTime(d.quellStart)}
                      {d.quellBeschreibung ? ` · ${d.quellBeschreibung}` : ""}
                    </p>
                    {d.quellBesetzung.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {d.quellBesetzung.join(" · ")}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      <strong>Hallenspielplan:</strong> {formatDateTime(d.rundenspielStart)}
                      {d.rundenspielBeschreibung ? ` · ${d.rundenspielBeschreibung}` : ""}
                    </p>
                    {d.rundenspielBesetzung.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {d.rundenspielBesetzung.join(" · ")}
                      </p>
                    )}
                  </div>
                  <form action={spielDuplikatVerknuepfen}>
                    <input type="hidden" name="quellId" value={d.quellId} />
                    <input type="hidden" name="rundenspielId" value={d.rundenspielId} />
                    <Button type="submit" variant="outline" size="sm">
                      Verknüpfen
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {istAdmin && icsDuplikate.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Mögliche Duplikate (Schiedsrichter-ICS)</CardTitle>
            <CardDescription>
              Manuell angelegte Freundschaftsspiele/Turnier-Einzelspiele, die
              zeitlich mit dem persönlichen ICS-Feed-Termin eines
              Schiedsrichters zusammenfallen — vermutlich dieselbe Begegnung.
              Anders als oben kein automatisches Verknüpfen: der ICS-Termin
              wird bei jedem Sync anhand der Quelle neu geschrieben, daher
              hier nur zur Info — bei Bedarf einen der beiden Termine manuell
              entfernen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {icsDuplikate.map((d) => (
                <div key={`${d.quellId}-${d.icsId}`} className="py-3 text-sm first:pt-0 last:pb-0">
                  <p>
                    <strong>{QUELL_TYP_LABEL[d.quellTyp] ?? d.quellTyp}:</strong>{" "}
                    {formatDateTime(d.quellStart)}
                    {d.quellBeschreibung ? ` · ${d.quellBeschreibung}` : ""}
                  </p>
                  {d.quellBesetzung.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {d.quellBesetzung.join(" · ")}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    <strong>Schiedsrichter-ICS:</strong> {formatDateTime(d.icsStart)}
                    {d.icsBeschreibung ? ` · ${d.icsBeschreibung}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alle importierten Spiele</CardTitle>
        </CardHeader>
        <CardContent>
          <RundenspieleListe liste={liste} />
        </CardContent>
      </Card>
    </div>
  );
}
