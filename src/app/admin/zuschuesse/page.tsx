import { requireAdmin } from "@/lib/session";
import {
  holeOffeneEinsaetze,
  holeZuschussarten,
  holeZuschussEinstellungen,
  holeZuschuesse,
} from "@/lib/zuschuss";
import {
  zuschussAktivierungSpeichern,
  zuschussAnlegen,
  zuschussartAnlegen,
  zuschussartEntfernen,
} from "./actions";
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
import { formatDatum as formatDate } from "@/lib/format";

export default async function ZuschuessePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const verein = await holeZuschussEinstellungen(vereinId);
  const aktiviert = verein?.zuschuesseAktiviert ?? false;

  const [zuschussartenListe, zuschuesseListe, offeneEinsaetze] =
    await Promise.all([
      holeZuschussarten(vereinId),
      holeZuschuesse(vereinId),
      aktiviert ? holeOffeneEinsaetze(vereinId) : Promise.resolve([]),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Zuschüsse</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Einfache Zuschussberechnung für Schiedsrichter-Einsätze. Die
          eigentliche Abrechnung/Auszahlung läuft in einem externen System —
          hier nur Berechnung und Export.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Zuschüsse aktivieren</CardTitle>
          <CardDescription>
            Solange deaktiviert, taucht auf dieser Seite nichts zum Anlegen
            auf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={zuschussAktivierungSpeichern}
            className="flex items-center gap-3"
          >
            <Switch
              key={String(aktiviert)}
              name="aktiviert"
              defaultChecked={aktiviert}
              id="aktiviert"
            />
            <Label htmlFor="aktiviert">Zuschüsse für diesen Verein aktiv</Label>
            <Button type="submit" variant="outline" size="sm">
              Speichern
            </Button>
          </form>
        </CardContent>
      </Card>

      {!aktiviert && (
        <Alert className="max-w-2xl">
          <AlertTitle>Zuschüsse sind deaktiviert</AlertTitle>
          <AlertDescription>
            Aktiviere sie oben, um Zuschussarten zu pflegen und Zuschüsse für
            Schiedsrichter-Einsätze anzulegen.
          </AlertDescription>
        </Alert>
      )}

      {aktiviert && (
        <>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader>
                <CardTitle>Zuschussarten</CardTitle>
                <CardDescription>
                  Vom Verein gepflegte Sätze, z.B. „Aufwandsentschädigung
                  Schiedsrichter“.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {zuschussartenListe.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Zuschussarten angelegt.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bezeichnung</TableHead>
                        <TableHead>Satz</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zuschussartenListe.map((art) => (
                        <TableRow key={art.id}>
                          <TableCell className="font-medium">
                            {art.bezeichnung}
                          </TableCell>
                          <TableCell>{art.satz} €</TableCell>
                          <TableCell className="text-right">
                            <form action={zuschussartEntfernen}>
                              <input
                                type="hidden"
                                name="zuschussartId"
                                value={art.id}
                              />
                              <button
                                type="submit"
                                className="text-xs text-muted-foreground underline"
                              >
                                Entfernen
                              </button>
                            </form>
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
                <CardTitle>Neue Zuschussart</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={zuschussartAnlegen}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="bezeichnung">Bezeichnung</Label>
                    <Input id="bezeichnung" name="bezeichnung" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="artSatz">Satz (€)</Label>
                    <Input
                      id="artSatz"
                      name="satz"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Anlegen
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Offene Einsätze (noch kein Zuschuss)</CardTitle>
            </CardHeader>
            <CardContent>
              {zuschussartenListe.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Erst eine Zuschussart anlegen, um Zuschüsse vergeben zu
                  können.
                </p>
              ) : offeneEinsaetze.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine offenen Einsätze.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Schiedsrichter</TableHead>
                      <TableHead>Zuschussart</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offeneEinsaetze.map((e) => (
                      <TableRow
                        key={`${e.terminId}-${e.userId}-${e.funktionstraegerTyp}`}
                      >
                        <TableCell>{formatDate(e.terminStart)}</TableCell>
                        <TableCell>{e.terminBeschreibung ?? "—"}</TableCell>
                        <TableCell>{e.personName ?? e.personEmail}</TableCell>
                        <TableCell>
                          <form
                            action={zuschussAnlegen}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="terminId"
                              value={e.terminId}
                            />
                            <input
                              type="hidden"
                              name="userId"
                              value={e.userId}
                            />
                            <div className="w-56">
                              <LabeledSelect
                                name="zuschussartId"
                                placeholder="Zuschussart wählen…"
                                required
                                options={zuschussartenListe.map((art) => ({
                                  value: art.id,
                                  label: `${art.bezeichnung} (${art.satz} €)`,
                                }))}
                              />
                            </div>
                            <Button type="submit" variant="outline" size="sm">
                              Anlegen
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Zuschüsse</CardTitle>
          <Button
            size="sm"
            nativeButton={false}
            render={<a href="/admin/zuschuesse/export" />}
          >
            Offene als CSV exportieren
          </Button>
        </CardHeader>
        <CardContent>
          {zuschuesseListe.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Zuschüsse angelegt.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Person</TableHead>
                  <TableHead>Betrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zuschuesseListe.map((z) => (
                  <TableRow key={z.id}>
                    <TableCell>{formatDate(z.terminStart)}</TableCell>
                    <TableCell>{z.personName ?? z.personEmail}</TableCell>
                    <TableCell>{z.berechneterBetrag} €</TableCell>
                    <TableCell>{z.status}</TableCell>
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
