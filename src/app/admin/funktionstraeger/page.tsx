import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, users } from "@/db/schema";
import { createFunktionstraeger, funktionstraegerImportieren } from "../actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FunktionstraegerTabelle } from "@/components/funktionstraeger-tabelle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { Switch } from "@/components/ui/switch";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienstwart",
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

  const [rollen, mannschaftsListe, alleAdmins] = await withTenant(
    vereinId,
    async (tx) => {
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

      // Admins tauchen nicht zwingend in funktionstraeger_rolle auf (eine
      // Person kann NUR Admin sein, ohne eigenen Funktionsträger-Typ) —
      // deshalb separat geladen und unten in die Personen-Liste eingemischt.
      const alleAdmins = await tx
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.vereinId, vereinId), eq(users.istAdmin, true)));

      return [rollen, mannschaftsListe, alleAdmins];
    }
  );

  // Eine Person kann mehrere Rollen haben — in der Übersicht bekommt sie
  // eine Zeile mit allen Rollen als Chips statt einer Zeile pro Rolle.
  const personenMap = rollen.reduce((map, r) => {
    const eintrag = map.get(r.userId) ?? {
      userId: r.userId,
      name: r.name,
      email: r.email,
      istAdmin: false,
      rollen: [] as typeof rollen,
    };
    eintrag.rollen.push(r);
    map.set(r.userId, eintrag);
    return map;
  }, new Map<string, { userId: string; name: string | null; email: string; istAdmin: boolean; rollen: typeof rollen }>());

  for (const admin of alleAdmins) {
    const eintrag = personenMap.get(admin.userId) ?? {
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      istAdmin: false,
      rollen: [] as typeof rollen,
    };
    eintrag.istAdmin = true;
    personenMap.set(admin.userId, eintrag);
  }

  const personen = Array.from(personenMap.values());

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
            <FunktionstraegerTabelle
              personen={personen}
              eigeneUserId={session.user.id}
              mannschaftsListe={mannschaftsListe}
            />
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

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="istAdmin"
                  className="size-4"
                />
                Admin (voller Zugriff auf den Vereinsbereich)
              </label>

              <div className="flex flex-col gap-2">
                <Label htmlFor="mannschaftId">Mannschaft (nur bei Trainer)</Label>
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
