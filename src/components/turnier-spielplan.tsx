import { createTurnierSpiel, deleteTurnierSpiel, updateTurnierSpiel } from "@/app/admin/actions";
import { gruppiereProTag } from "@/lib/kalender";
import {
  formatDatumZeit as formatDateTime,
  formatWochentagDatum,
  toDatetimeLocalWert,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Spiel = {
  id: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  ergebnisHeim: number | null;
  ergebnisAuswaerts: number | null;
};

// Wiederverwendet von /admin/termine/[id] (Vereinsadmin) UND
// /profil/turnier/[id] (Turnierverantwortlicher, siehe
// src/lib/turnier-zugriff.ts) — beide dürfen den Spielplan gleichermaßen
// pflegen, daher eine gemeinsame Komponente statt Duplikat.
export function TurnierSpielplan({
  spiele,
  turnierId,
}: {
  spiele: Spiel[];
  turnierId: string;
}) {
  const gruppen = gruppiereProTag(spiele);
  // Tages-Überschriften nur bei mehrtägigen Turnieren — bei eintägigen wäre
  // eine einzelne, immer gleiche Überschrift nur Rauschen.
  const mehrtaegig = gruppen.length > 1;

  return (
    <div className="flex flex-col gap-4">
      {spiele.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Einzelspiele angelegt.
        </p>
      ) : (
        gruppen.map((gruppe) => (
          <div key={gruppe.tag} className="flex flex-col gap-2">
            {mehrtaegig && (
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {formatWochentagDatum(gruppe.items[0].start)}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Start</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Begegnung</TableHead>
                  <TableHead>Ergebnis</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gruppe.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell colSpan={4} className="p-0">
                      <div className="flex items-start justify-between gap-2 p-3">
                        <details className="group min-w-0 flex-1">
                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                              <span className="font-medium">
                                {formatDateTime(s.start)}
                              </span>
                              <span className="text-muted-foreground">
                                {s.ort ?? "—"}
                              </span>
                              <span>{s.beschreibung ?? "—"}</span>
                              {s.ergebnisHeim !== null &&
                                s.ergebnisAuswaerts !== null && (
                                  <span className="font-medium">
                                    {s.ergebnisHeim}:{s.ergebnisAuswaerts}
                                  </span>
                                )}
                              <span className="text-xs text-muted-foreground underline">
                                <span className="group-open:hidden">
                                  Bearbeiten
                                </span>
                                <span className="hidden group-open:inline">
                                  Schließen
                                </span>
                              </span>
                            </span>
                          </summary>
                          <form
                            action={updateTurnierSpiel}
                            className="mt-2 flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="terminId" value={s.id} />
                            <input
                              type="hidden"
                              name="turnierId"
                              value={turnierId}
                            />
                            <Input
                              name="start"
                              type="datetime-local"
                              defaultValue={toDatetimeLocalWert(s.start)}
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
                            <Input
                              name="ergebnisHeim"
                              type="number"
                              defaultValue={s.ergebnisHeim ?? ""}
                              placeholder="Heim"
                              className="h-8 w-16"
                            />
                            <span className="text-muted-foreground">:</span>
                            <Input
                              name="ergebnisAuswaerts"
                              type="number"
                              defaultValue={s.ergebnisAuswaerts ?? ""}
                              placeholder="Ausw."
                              className="h-8 w-16"
                            />
                            <Button type="submit" variant="outline" size="sm">
                              Speichern
                            </Button>
                          </form>
                        </details>
                        <form action={deleteTurnierSpiel}>
                          <input type="hidden" name="terminId" value={s.id} />
                          <input
                            type="hidden"
                            name="turnierId"
                            value={turnierId}
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
          </div>
        ))
      )}

      <form
        action={createTurnierSpiel}
        className="flex flex-wrap items-end gap-2 border-t pt-4"
      >
        <input type="hidden" name="turnierId" value={turnierId} />
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
    </div>
  );
}
