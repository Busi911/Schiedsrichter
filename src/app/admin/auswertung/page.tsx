import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeTermineFuerAuswertung } from "@/lib/termin-auswertung";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

export default async function AuswertungPage({
  searchParams,
}: {
  searchParams: Promise<{
    von?: string;
    bis?: string;
    typ?: string;
    schiedsrichterId?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const filter = await searchParams;

  const [termineListe, schiedsrichterListe] = await Promise.all([
    holeTermineFuerAuswertung(vereinId, filter),
    withTenant(vereinId, (tx) =>
      tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(eq(funktionstraegerRollen.typ, "schiedsrichter"))
    ),
  ]);

  const exportParams = new URLSearchParams();
  if (filter.von) exportParams.set("von", filter.von);
  if (filter.bis) exportParams.set("bis", filter.bis);
  if (filter.typ) exportParams.set("typ", filter.typ);
  if (filter.schiedsrichterId)
    exportParams.set("schiedsrichterId", filter.schiedsrichterId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Terminauswertung
        </h1>
        <p className="text-sm text-muted-foreground">
          Rohdaten für Auswertung/Abrechnung außerhalb der App — filterbar
          und exportierbar.
        </p>
      </div>

      <Card>
        <CardContent>
          <form
            method="get"
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="von">Von</Label>
              <Input id="von" name="von" type="date" defaultValue={filter.von} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bis">Bis</Label>
              <Input id="bis" name="bis" type="date" defaultValue={filter.bis} />
            </div>
            <div className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="typ">Typ</Label>
              <LabeledSelect
                id="typ"
                name="typ"
                defaultValue={filter.typ ?? undefined}
                placeholder="Alle"
                options={Object.entries(TYP_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </div>
            <div className="flex w-56 flex-col gap-1.5">
              <Label htmlFor="schiedsrichterId">Schiedsrichter</Label>
              <LabeledSelect
                id="schiedsrichterId"
                name="schiedsrichterId"
                defaultValue={filter.schiedsrichterId ?? undefined}
                placeholder="Alle"
                options={schiedsrichterListe.map((s) => ({
                  value: s.id,
                  label: s.name ?? s.email,
                }))}
              />
            </div>
            <Button type="submit" variant="outline">
              Filtern
            </Button>
            <Button
              render={<a href={`/admin/auswertung/export?${exportParams.toString()}`} />}
              nativeButton={false}
            >
              Als CSV exportieren
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a href={`/admin/auswertung/export/pdf?${exportParams.toString()}`} />
              }
            >
              Als PDF exportieren
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Termine</CardTitle>
        </CardHeader>
        <CardContent>
          {termineListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine Termine für die gewählten Filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead>Mannschaft</TableHead>
                  <TableHead>Schiedsrichter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {termineListe.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {formatDateTime(t.start)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {t.typ === "rundenspiel"
                          ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                          : TYP_LABEL[t.typ] ?? t.typ}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.ort ?? "—"}</TableCell>
                    <TableCell>{t.beschreibung ?? "—"}</TableCell>
                    <TableCell>{t.mannschaftName ?? "—"}</TableCell>
                    <TableCell>{t.schiedsrichterName ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
