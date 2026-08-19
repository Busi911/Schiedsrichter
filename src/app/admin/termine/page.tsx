import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { ignorierteMannschaften, mannschaften, termine } from "@/db/schema";
import {
  createTermin,
  mannschaftAusRundenspielAnlegen,
  spielDuplikatVerknuepfen,
  unbekannteMannschaftAblehnen,
} from "../actions";
import { gruppiereUnbekannteMannschaften } from "@/lib/rundenspiel-import";
import { findeSpielDuplikate } from "@/lib/duplikat-erkennung";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { formatMannschaft } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Alle Termine</CardTitle>
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

      {istAdmin && (
        <CollapsibleCard title="Neuer Termin" description="Freundschaftsspiel oder Turnier anlegen">
          <form action={createTermin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="typ">Typ</Label>
              <LabeledSelect
                id="typ"
                name="typ"
                defaultValue="testspiel"
                required
                options={[
                  { value: "testspiel", label: "Freundschaftsspiel" },
                  { value: "turnier", label: "Turnier" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="start">Start</Label>
              <Input id="start" name="start" type="datetime-local" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ende">Ende (optional)</Label>
              <Input id="ende" name="ende" type="datetime-local" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ort">Ort</Label>
              <Input id="ort" name="ort" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="beschreibung">Beschreibung / Gegner</Label>
              <Input id="beschreibung" name="beschreibung" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="mannschaftId">Mannschaft (optional)</Label>
              <LabeledSelect
                id="mannschaftId"
                name="mannschaftId"
                placeholder="—"
                options={mannschaftsListe.map((m) => ({
                  value: m.id,
                  label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
                }))}
              />
            </div>

            <Button type="submit" className="w-full">
              Anlegen
            </Button>
          </form>
        </CollapsibleCard>
      )}
    </div>
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
        mannschaftId: termine.mannschaftId,
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

  const ignoriert = await withTenant(vereinId, (tx) =>
    tx.query.ignorierteMannschaften.findMany({
      where: eq(ignorierteMannschaften.vereinId, vereinId),
    })
  );
  const ignoriertSet = new Set(
    ignoriert.map((i) => `${i.normalisierterName}::${i.kategorie ?? ""}`)
  );
  const unbekannteMannschaften = gruppiereUnbekannteMannschaften(liste).filter(
    (m) => !ignoriertSet.has(`${m.normalisiert}::${m.kategorie ?? ""}`)
  );
  const moeglicheDuplikate = await findeSpielDuplikate(vereinId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Alle Spiele an der eigenen Halle — Liga-Pflichtspiele ebenso wie
        Freundschaftsspiele/Turniere, automatisch aus nuLiga synchronisiert
        (siehe Einstellungen). Inklusive Spiele fremder Mannschaften an der
        eigenen Halle (relevant für Ordner-/Kioskdienst).
      </p>

      {istAdmin && unbekannteMannschaften.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Unbekannte Mannschaften</CardTitle>
            <CardDescription>
              Heim-/Auswärtsnamen aus dem Import, die noch keiner Mannschaft
              zugeordnet sind — sortiert nach Häufigkeit. Bereits importierte
              Spiele werden beim Anlegen rückwirkend verknüpft.
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

      {istAdmin && moeglicheDuplikate.length > 0 && (
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
              {moeglicheDuplikate.map((d) => (
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
