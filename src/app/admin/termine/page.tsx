import { and, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import { createTermin } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/collapsible-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
};

export default async function TerminePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [liste, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const liste = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        inArray(termine.typ, ["testspiel", "turnier"])
      ),
      orderBy: (t, { asc }) => [asc(t.start)],
    });
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    });
    return [liste, mannschaftsListe];
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Freundschaftsspiele &amp; Turniere
        </h1>
        <p className="text-sm text-muted-foreground">
          Vom Verein selbst veranstaltete Termine (unabhängig vom
          ICS-Feed der Schiedsrichter).
        </p>
      </div>

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
                <Input
                  id="start"
                  name="start"
                  type="datetime-local"
                  required
                />
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
      </div>
    </div>
  );
}
