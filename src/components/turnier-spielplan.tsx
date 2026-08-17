"use client";

import { useState, useTransition } from "react";
import {
  createTurnierSpiel,
  deleteTurnierSpiel,
  turnierSpieleVertauschen,
  updateTurnierSpiel,
} from "@/app/admin/actions";
import { gruppiereProTag } from "@/lib/kalender";
import {
  formatDatumZeit as formatDateTime,
  formatWochentagDatum,
  toDatetimeLocalWert,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

type Spiel = {
  id: string;
  // Meist "turnier_spiel" (hier frei bearbeitbar). Ein anderer Typ (aktuell
  // nur "rundenspiel") kommt vor, wenn ein Turnier-Einzelspiel nachträglich
  // mit einem Hallenspielplan-Import verknüpft wurde (siehe
  // spielDuplikatVerknuepfen in admin/actions.ts) — dessen Daten kommen von
  // nuLiga und sind hier bewusst nur lesbar, nicht über die
  // Turnier-Spielplan-Aktionen bearbeitbar/löschbar (die filtern hart auf
  // typ = "turnier_spiel").
  typ: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  ergebnisHeim: number | null;
  ergebnisAuswaerts: number | null;
};

// Wiederverwendet von /admin/termine/[id] (Vereinsadmin) UND
// /profil/turnier/[id] (Turnierverantwortlicher, siehe
// src/lib/turnier-zugriff.ts) — beide dürfen den Spielplan gleichermaßen
// pflegen, daher eine gemeinsame Komponente statt Duplikat. Client-
// Komponente wegen Drag & Drop (siehe unten), das lokalen Zustand braucht.
export function TurnierSpielplan({
  spiele,
  turnierId,
  turnierOrt,
  // Default true: /profil/turnier/[id] (Turnierverantwortlicher) übergibt
  // das nicht, dessen Zugriff hängt an istTurnierBerechtigt, nicht an
  // istAdmin — nur /admin/termine/[id] setzt das explizit auf istAdmin
  // (siehe "Admin, nur lesend" in db/schema.ts).
  schreibzugriff = true,
}: {
  spiele: Spiel[];
  turnierId: string;
  // Ort des Turniers selbst — Fallback für Spiele ohne eigenen Ort, s.u.
  turnierOrt?: string | null;
  schreibzugriff?: boolean;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const gruppen = gruppiereProTag(spiele);
  // Tages-Überschriften nur bei mehrtägigen Turnieren — bei eintägigen wäre
  // eine einzelne, immer gleiche Überschrift nur Rauschen.
  const mehrtaegig = gruppen.length > 1;

  // Vertauscht Start + Ort zweier Spiele (siehe turnierSpieleVertauschen) —
  // Begegnung/Ergebnis bleiben an ihrer Zeile, es wandert nur der Zeitslot.
  function vertauschen(spielIdA: string, spielIdB: string) {
    if (spielIdA === spielIdB) return;
    const formData = new FormData();
    formData.set("turnierId", turnierId);
    formData.set("spielIdA", spielIdA);
    formData.set("spielIdB", spielIdB);
    startTransition(() => {
      turnierSpieleVertauschen(formData);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {spiele.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Einzelspiele angelegt.
        </p>
      ) : (
        <>
          {schreibzugriff && (
            <p className="text-xs text-muted-foreground">
              Reihenfolge per Drag &amp; Drop ändern — zieh eine Zeile auf
              eine andere, um deren Zeitslot (Start + Ort) zu tauschen.
            </p>
          )}
          {gruppen.map((gruppe) => (
            <div key={gruppe.tag} className="flex flex-col gap-2">
              {mehrtaegig && (
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {formatWochentagDatum(gruppe.items[0].start)}
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6" />
                    <TableHead>Start</TableHead>
                    <TableHead>Ort</TableHead>
                    <TableHead>Begegnung</TableHead>
                    <TableHead>Ergebnis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gruppe.items.map((s) => {
                    // Nur echte turnier_spiel-Einträge lassen sich hier
                    // verschieben/bearbeiten/löschen (siehe Spiel-Typ oben) —
                    // die zugehörigen Server Actions filtern ebenfalls hart
                    // darauf, ein Drag&Drop oder Speichern/Löschen auf einem
                    // verknüpften Rundenspiel liefe sonst ins Leere. Zusätzlich
                    // nur mit Schreibzugriff (siehe "Admin, nur lesend").
                    const istVerknuepft = s.typ !== "turnier_spiel";
                    const bearbeitbar = !istVerknuepft && schreibzugriff;
                    return (
                      <TableRow
                        key={s.id}
                        draggable={!isPending && bearbeitbar}
                        onDragStart={(e) => {
                          // Firefox startet den Drag sonst gar nicht erst —
                          // der eigentliche Zustand läuft aber über React
                          // State (draggedId), die Daten hier sind nur die
                          // von Firefox verlangte Mindestangabe.
                          e.dataTransfer.setData("text/plain", s.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedId(s.id);
                        }}
                        onDragOver={(e) => {
                          if (!bearbeitbar) return;
                          e.preventDefault();
                          if (dragOverId !== s.id) setDragOverId(s.id);
                        }}
                        onDragLeave={() =>
                          setDragOverId((id) => (id === s.id ? null : id))
                        }
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedId && bearbeitbar) vertauschen(draggedId, s.id);
                          setDraggedId(null);
                          setDragOverId(null);
                        }}
                        onDragEnd={() => {
                          setDraggedId(null);
                          setDragOverId(null);
                        }}
                        className={cn(
                          dragOverId === s.id &&
                            draggedId &&
                            draggedId !== s.id &&
                            "bg-accent"
                        )}
                      >
                        <TableCell
                          className={cn(
                            "text-muted-foreground select-none",
                            bearbeitbar
                              ? "cursor-grab active:cursor-grabbing"
                              : "opacity-30"
                          )}
                          title={
                            bearbeitbar
                              ? "Ziehen zum Tauschen des Zeitslots"
                              : undefined
                          }
                        >
                          ⠿
                        </TableCell>
                        <TableCell colSpan={4} className="p-0">
                          <div className="flex items-start justify-between gap-2 p-3">
                            {bearbeitbar ? (
                              <details className="group min-w-0 flex-1">
                                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                                    <span className="font-medium">
                                      {formatDateTime(s.start)}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {s.ort ?? turnierOrt ?? "—"}
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
                                    placeholder={
                                      turnierOrt
                                        ? `wie Turnier (${turnierOrt})`
                                        : "Ort"
                                    }
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
                            ) : (
                              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                                <span className="font-medium">
                                  {formatDateTime(s.start)}
                                </span>
                                <span className="text-muted-foreground">
                                  {s.ort ?? turnierOrt ?? "—"}
                                </span>
                                <span>{s.beschreibung ?? "—"}</span>
                                {s.ergebnisHeim !== null &&
                                  s.ergebnisAuswaerts !== null && (
                                    <span className="font-medium">
                                      {s.ergebnisHeim}:{s.ergebnisAuswaerts}
                                    </span>
                                  )}
                                {istVerknuepft && (
                                  <Badge variant="outline" className="text-xs">
                                    Aus Hallenspielplan verknüpft
                                  </Badge>
                                )}
                              </span>
                            )}
                            {bearbeitbar && (
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
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ))}
        </>
      )}

      {schreibzugriff && (
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
          <Input
            id="spielOrt"
            name="ort"
            placeholder={turnierOrt ? `wie Turnier (${turnierOrt})` : "Ort"}
            className="h-8 w-28"
          />
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
      )}
    </div>
  );
}
