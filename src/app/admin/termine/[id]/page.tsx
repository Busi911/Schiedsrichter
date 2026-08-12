import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import {
  createTurnierSpiel,
  deleteTermin,
  deleteTurnierSpiel,
  turnierLinkErneuern,
  updateTermin,
  updateTurnierSpiel,
} from "../../actions";
import { appUrl } from "@/lib/app-url";
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

function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default async function TerminBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { id } = await params;

  const [termin, mannschaftsListe, spiele] = await withTenant(
    vereinId,
    async (tx) => {
      const termin = await tx.query.termine.findFirst({
        where: and(eq(termine.id, id), eq(termine.vereinId, vereinId)),
      });
      const mannschaftsListe = await tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, vereinId),
        orderBy: (m, { asc }) => [asc(m.name)],
      });
      const spiele =
        termin?.typ === "turnier"
          ? await tx.query.termine.findMany({
              where: eq(termine.turnierId, id),
              orderBy: (t, { asc }) => [asc(t.start)],
            })
          : [];
      return [termin, mannschaftsListe, spiele];
    }
  );

  if (!termin || termin.quelle !== "manuell") {
    notFound();
  }

  const istTurnier = termin.typ === "turnier";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/termine"
          className="text-sm text-muted-foreground underline"
        >
          ← Zurück zu Termine
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          {istTurnier ? "Turnier bearbeiten" : "Termin bearbeiten"}
        </h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTermin} className="flex flex-col gap-4">
            <input type="hidden" name="terminId" value={termin.id} />

            <div className="flex flex-col gap-2">
              <Label htmlFor="typ">Typ</Label>
              <LabeledSelect
                id="typ"
                name="typ"
                defaultValue={termin.typ}
                required
                options={[
                  { value: "testspiel", label: "Freundschaftsspiel" },
                  { value: "turnier", label: "Turnier" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="start">
                {istTurnier ? "Beginn" : "Start"}
              </Label>
              <Input
                id="start"
                name="start"
                type="datetime-local"
                defaultValue={toDatetimeLocal(termin.start)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ende">
                {istTurnier ? "Ende (optional)" : "Ende (optional)"}
              </Label>
              <Input
                id="ende"
                name="ende"
                type="datetime-local"
                defaultValue={termin.ende ? toDatetimeLocal(termin.ende) : ""}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ort">Ort</Label>
              <Input id="ort" name="ort" defaultValue={termin.ort ?? ""} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="beschreibung">
                {istTurnier ? "Titel" : "Beschreibung / Gegner"}
              </Label>
              <Input
                id="beschreibung"
                name="beschreibung"
                defaultValue={termin.beschreibung ?? ""}
                placeholder={istTurnier ? "z.B. Sommerturnier 2026" : undefined}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="mannschaftId">Mannschaft (optional)</Label>
              <LabeledSelect
                id="mannschaftId"
                name="mannschaftId"
                placeholder="—"
                defaultValue={termin.mannschaftId ?? undefined}
                options={mannschaftsListe.map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
              />
            </div>

            <Button type="submit" className="w-full">
              Speichern
            </Button>
          </form>

          <form action={deleteTermin} className="mt-4">
            <input type="hidden" name="terminId" value={termin.id} />
            <Button type="submit" variant="destructive" className="w-full">
              {istTurnier ? "Turnier löschen" : "Termin löschen"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {istTurnier && (
        <>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Öffentlicher Link</CardTitle>
              <CardDescription>
                Wer den Link kennt, sieht den Spielplan dieses Turniers —
                ganz ohne Login, rein lesend. Ideal zum Teilen mit anderen
                Vereinen oder Eltern.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
                {termin.freigabeToken
                  ? `${appUrl()}/turnier/${termin.freigabeToken}`
                  : "Kein Link vorhanden."}
              </p>
              <form action={turnierLinkErneuern}>
                <input type="hidden" name="turnierId" value={termin.id} />
                <Button type="submit" variant="outline" size="sm">
                  Link neu generieren (alter Link wird ungültig)
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spielplan</CardTitle>
              <CardDescription>
                Einzelspiele dieses Turniers — jedes kann separat
                Schiedsrichter/Zeitnehmer/Sekretär zugeordnet bekommen (siehe
                Zuordnung).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {spiele.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Einzelspiele angelegt.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Start</TableHead>
                      <TableHead>Ort</TableHead>
                      <TableHead>Begegnung</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spiele.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell colSpan={4} className="p-0">
                          <div className="flex flex-wrap items-center gap-2 p-3">
                            <form
                              action={updateTurnierSpiel}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="terminId" value={s.id} />
                              <input
                                type="hidden"
                                name="turnierId"
                                value={termin.id}
                              />
                              <Input
                                name="start"
                                type="datetime-local"
                                defaultValue={toDatetimeLocal(s.start)}
                                required
                                className="h-8 w-48"
                              />
                              <Input
                                name="ort"
                                defaultValue={s.ort ?? ""}
                                placeholder="Ort"
                                className="h-8 w-28"
                              />
                              <Input
                                name="beschreibung"
                                defaultValue={s.beschreibung ?? ""}
                                placeholder="z.B. TSV A – TSV B"
                                className="h-8 w-48"
                              />
                              <Button type="submit" variant="outline" size="sm">
                                Speichern
                              </Button>
                            </form>
                            <form action={deleteTurnierSpiel}>
                              <input type="hidden" name="terminId" value={s.id} />
                              <input
                                type="hidden"
                                name="turnierId"
                                value={termin.id}
                              />
                              <Button type="submit" variant="ghost" size="sm">
                                Löschen
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <form
                action={createTurnierSpiel}
                className="flex flex-wrap items-end gap-2 border-t pt-4"
              >
                <input type="hidden" name="turnierId" value={termin.id} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="spielStart">Start</Label>
                  <Input
                    id="spielStart"
                    name="start"
                    type="datetime-local"
                    required
                    className="h-8 w-48"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="spielOrt">Ort</Label>
                  <Input id="spielOrt" name="ort" className="h-8 w-28" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="spielBeschreibung">Begegnung</Label>
                  <Input
                    id="spielBeschreibung"
                    name="beschreibung"
                    placeholder="z.B. TSV A – TSV B"
                    className="h-8 w-48"
                  />
                </div>
                <Button type="submit" size="sm">
                  Spiel hinzufügen
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
