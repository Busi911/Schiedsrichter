import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, users } from "@/db/schema";
import {
  createFunktionstraeger,
  funktionstraegerAktivToggeln,
  funktionstraegerImportieren,
  updateFunktionstraeger,
} from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
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
        userId: funktionstraegerRollen.userId,
        typ: funktionstraegerRollen.typ,
        aktiv: funktionstraegerRollen.aktiv,
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

  // Eine Person kann mehrere Rollen haben — in der Übersicht bekommt sie
  // eine Zeile mit allen Rollen als Chips statt einer Zeile pro Rolle.
  const personen = Array.from(
    rollen
      .reduce((map, r) => {
        const eintrag = map.get(r.userId) ?? {
          userId: r.userId,
          name: r.name,
          email: r.email,
          rollen: [] as typeof rollen,
        };
        eintrag.rollen.push(r);
        map.set(r.userId, eintrag);
        return map;
      }, new Map<string, { userId: string; name: string | null; email: string; rollen: typeof rollen }>())
      .values()
  );

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
            {personen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Funktionsträger angelegt.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Rollen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personen.map((p) => (
                    <TableRow key={p.userId}>
                      <TableCell colSpan={2} className="align-top">
                        <form
                          action={updateFunktionstraeger}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="userId" value={p.userId} />
                          <Input
                            key={`name-${p.name}`}
                            name="name"
                            defaultValue={p.name ?? ""}
                            required
                            className="h-8 w-36"
                          />
                          <Input
                            key={`email-${p.email}`}
                            name="email"
                            type="email"
                            defaultValue={p.email}
                            required
                            className="h-8 w-48"
                          />
                          <Button type="submit" variant="outline" size="sm">
                            Speichern
                          </Button>
                        </form>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {p.rollen.map((r) => (
                            <span
                              key={r.rolleId}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                                r.aktiv
                                  ? "border-border"
                                  : "border-destructive/30 text-destructive"
                              }`}
                            >
                              <span className="font-medium">
                                {TYP_LABEL[r.typ] ?? r.typ}
                                {r.mannschaftName ? ` (${r.mannschaftName})` : ""}
                                {!r.aktiv && " · inaktiv"}
                              </span>
                              <form action={funktionstraegerAktivToggeln}>
                                <input
                                  type="hidden"
                                  name="rolleId"
                                  value={r.rolleId}
                                />
                                <button
                                  type="submit"
                                  className="text-muted-foreground underline"
                                >
                                  {r.aktiv ? "Deaktivieren" : "Aktivieren"}
                                </button>
                              </form>
                            </span>
                          ))}
                        </div>
                      </TableCell>
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
                <Label>Rollen (Mehrfachauswahl möglich)</Label>
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  {Object.entries(TYP_LABEL).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="typen"
                        value={value}
                        defaultChecked={value === "schiedsrichter"}
                        className="size-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
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

              <div className="flex items-center gap-3">
                <Switch name="sofortAktiv" id="sofortAktiv" defaultChecked />
                <Label htmlFor="sofortAktiv">
                  Sofort aktivieren (Willkommens-Mail mit Login-Link senden)
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Ohne Haken wird die Person ohne Login angelegt — die Mail
                geht erst raus, wenn sie später über &bdquo;Aktivieren&ldquo;
                freigeschaltet wird.
              </p>

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
            Personen/Rollen werden übersprungen, nicht dupliziert. Für
            mehrere Rollen pro Person einfach mehrere Zeilen mit derselben
            E-Mail-Adresse verwenden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={funktionstraegerImportieren}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-end gap-3">
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
            </div>
            <div className="flex items-center gap-3">
              <Switch
                name="sofortAktiv"
                id="importSofortAktiv"
                defaultChecked
              />
              <Label htmlFor="importSofortAktiv">
                Sofort aktivieren (Willkommens-Mails an alle neuen Personen
                senden)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Ohne Haken werden alle importierten Personen ohne Login
              angelegt — du aktivierst sie danach einzeln in der Liste oben,
              jeweils mit eigener Willkommens-Mail zu dem Zeitpunkt.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
