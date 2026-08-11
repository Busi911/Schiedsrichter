import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, users } from "@/db/schema";
import { createFunktionstraeger, funktionstraegerImportieren } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

export default async function FunktionstraegerPage({
  searchParams,
}: {
  searchParams: Promise<{
    importAngelegt?: string;
    importUebersprungen?: string;
    importFehler?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const importErgebnis = await searchParams;

  const [rollen, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const rollen = await tx
      .select({
        rolleId: funktionstraegerRollen.id,
        typ: funktionstraegerRollen.typ,
        name: users.name,
        email: users.email,
        mannschaftName: mannschaften.name,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .leftJoin(
        mannschaften,
        eq(funktionstraegerRollen.mannschaftId, mannschaften.id)
      )
      .where(eq(users.vereinId, vereinId));

    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    });

    return [rollen, mannschaftsListe];
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Funktionsträger
        </h1>
        <p className="text-sm text-muted-foreground">
          Alle Funktionsträger des Vereins verwalten.
        </p>
      </div>

      {importErgebnis.importAngelegt !== undefined && (
        <Alert
          variant={importErgebnis.importFehler ? "destructive" : "default"}
          className="max-w-2xl"
        >
          <AlertTitle>
            Import: {importErgebnis.importAngelegt} angelegt,{" "}
            {importErgebnis.importUebersprungen ?? 0} bereits vorhanden
            übersprungen
          </AlertTitle>
          {importErgebnis.importFehler && (
            <AlertDescription>
              {importErgebnis.importFehler.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
            </AlertDescription>
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Alle Funktionsträger</CardTitle>
          </CardHeader>
          <CardContent>
            {rollen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Funktionsträger angelegt.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Mannschaft</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rollen.map((r) => (
                    <TableRow key={r.rolleId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.email}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {TYP_LABEL[r.typ] ?? r.typ}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.mannschaftName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Neuer Funktionsträger</CardTitle>
            <CardDescription>Person anlegen oder Rolle ergänzen</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={createFunktionstraeger}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" name="email" type="email" required />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="typ">Rolle</Label>
                <LabeledSelect
                  id="typ"
                  name="typ"
                  defaultValue="schiedsrichter"
                  required
                  options={Object.entries(TYP_LABEL).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="mannschaftId">Mannschaft (nur bei Trainer)</Label>
                <LabeledSelect
                  id="mannschaftId"
                  name="mannschaftId"
                  placeholder="—"
                  options={mannschaftsListe.map((m) => ({
                    value: m.id,
                    label: m.name,
                  }))}
                />
              </div>

              <Button type="submit" className="w-full">
                Anlegen
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Aus Excel importieren</CardTitle>
          <CardDescription>
            Kopfzeile mit den Spalten <strong>Name</strong>,{" "}
            <strong>E-Mail</strong>, <strong>Rolle</strong> (Schiedsrichter,
            Zeitnehmer, Sekretär, Trainer, Ordner oder Kioskdienst) und
            optional <strong>Mannschaft</strong> (nur bei Trainer, muss einer
            bestehenden Mannschaft entsprechen). Bereits vorhandene
            Personen/Rollen werden übersprungen, nicht dupliziert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={funktionstraegerImportieren}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="datei">Excel-Datei (.xlsx)</Label>
              <input
                id="datei"
                name="datei"
                type="file"
                accept=".xlsx,.xls"
                required
                className="text-sm"
              />
            </div>
            <Button type="submit">Importieren</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
