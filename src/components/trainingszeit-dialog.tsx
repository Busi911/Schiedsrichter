"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LabeledSelect } from "@/components/labeled-select";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { cn } from "@/lib/utils";
import {
  abteilLabel,
  formatUhrzeit,
  TRAININGSFARBEN,
  WOCHENTAGE_LABEL,
  type HalleMitAbteilen,
} from "@/lib/trainingsplan";
import {
  trainingszeitAktualisieren,
  trainingszeitAnlegen,
  trainingszeitLoeschen,
} from "@/app/admin/(dashboard)/trainingsplan/actions";

export type TrainingszeitEintrag = {
  id: string;
  mannschaftId: string;
  halleId: string;
  wochentag: number;
  startMinuten: number;
  endMinuten: number;
  farbe: string;
  // null = kein Abteil zugewiesen (auch bei unterteilter Halle möglich,
  // siehe abteilNummer-Kommentar in db/schema.ts).
  abteilNummer: number | null;
};

function minutenZuZeitwert(minuten: number): string {
  return formatUhrzeit(minuten);
}

// Schließt den Dialog automatisch, sobald das umgebende <form> eine
// Übermittlung (egal ob Speichern oder Löschen, beide teilen sich dieselbe
// <form>-pending-Historie über formAction) beendet hat — ohne das würde der
// Dialog nach z.B. "Löschen" einfach offen stehenbleiben und dabei auf eine
// inzwischen nicht mehr existierende Trainingszeit zeigen. Muss innerhalb
// des <form> gerendert werden, useFormStatus liest sonst nichts.
function SchliesseNachSpeichern({ onFertig }: { onFertig: () => void }) {
  const { pending } = useFormStatus();
  const warPending = useRef(false);
  useEffect(() => {
    if (warPending.current && !pending) {
      onFertig();
    }
    warPending.current = pending;
  }, [pending, onFertig]);
  return null;
}

// Formular zum Anlegen ODER Bearbeiten einer Trainingszeit — dieselbe
// Komponente für beide Fälle (Felder/Layout identisch, nur Absende-Aktion
// und ob ein Löschen-Button erscheint unterscheiden sich), verwendet vom
// Desktop-Grid (Klick auf leeren Slot bzw. auf einen Block) UND von der
// Mobile-Agenda-Liste (siehe TrainingsplanGrid) — dort ersetzt dieses
// Formular das Ziehen/Resizen komplett, das auf einem Touch-Bildschirm in
// einer dichten Wochenansicht kaum bedienbar wäre.
export function TrainingszeitDialog({
  open,
  onOpenChange,
  mannschaften,
  hallen,
  eintrag,
  vorgabe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mannschaften: { id: string; label: string }[];
  hallen: ({ id: string; name: string } & HalleMitAbteilen)[];
  // Bearbeiten eines bestehenden Eintrags …
  eintrag?: TrainingszeitEintrag;
  // … ODER Neuanlage mit vorausgefüllten Werten (z.B. aus einem Klick auf
  // einen leeren Grid-Slot) — nie beides gleichzeitig.
  vorgabe?: {
    halleId: string;
    wochentag: number;
    startMinuten: number;
    endMinuten: number;
  };
}) {
  const bearbeiten = !!eintrag;
  const [farbe, setFarbe] = useState(eintrag?.farbe ?? TRAININGSFARBEN[0]);
  const [halleIdAuswahl, setHalleIdAuswahl] = useState(
    eintrag?.halleId ?? vorgabe?.halleId ?? hallen[0]?.id ?? ""
  );

  if (mannschaften.length === 0 || hallen.length === 0) return null;

  const halleId = halleIdAuswahl;
  const halleAusgewaehlt = hallen.find((h) => h.id === halleId) ?? hallen[0];
  const wochentag = eintrag?.wochentag ?? vorgabe?.wochentag ?? 0;
  const startMinuten = eintrag?.startMinuten ?? vorgabe?.startMinuten ?? 17 * 60;
  const endMinuten = eintrag?.endMinuten ?? vorgabe?.endMinuten ?? 18 * 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onSubmit={(e) => {
          const form = e.target as HTMLFormElement;
          const startZeit = (form.elements.namedItem("startZeit") as HTMLInputElement)
            .value;
          const endeZeit = (form.elements.namedItem("endeZeit") as HTMLInputElement)
            .value;
          const [sh, sm] = startZeit.split(":").map(Number);
          const [eh, em] = endeZeit.split(":").map(Number);
          (form.elements.namedItem("startMinuten") as HTMLInputElement).value = String(
            sh * 60 + sm
          );
          (form.elements.namedItem("endMinuten") as HTMLInputElement).value = String(
            eh * 60 + em
          );
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {bearbeiten ? "Training bearbeiten" : "Training hinzufügen"}
          </DialogTitle>
        </DialogHeader>
        <form
          action={bearbeiten ? trainingszeitAktualisieren : trainingszeitAnlegen}
          className="flex flex-col gap-3"
        >
          {bearbeiten && <input type="hidden" name="id" value={eintrag.id} />}
          <SchliesseNachSpeichern onFertig={() => onOpenChange(false)} />
          <input type="hidden" name="farbe" value={farbe} />
          <input type="hidden" name="startMinuten" />
          <input type="hidden" name="endMinuten" />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tz-mannschaft">Mannschaft</Label>
            <LabeledSelect
              id="tz-mannschaft"
              name="mannschaftId"
              required
              defaultValue={eintrag?.mannschaftId}
              options={mannschaften.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tz-halle">Halle</Label>
            <LabeledSelect
              id="tz-halle"
              name="halleId"
              required
              defaultValue={halleId}
              onValueChange={setHalleIdAuswahl}
              options={hallen.map((h) => ({ value: h.id, label: h.name }))}
            />
          </div>

          {halleAusgewaehlt.abteilAnzahl > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tz-abteil">Abteil</Label>
              <LabeledSelect
                // Remount bei Hallenwechsel (siehe onValueChange oben) —
                // sonst könnte eine bereits getroffene Abteil-Auswahl nach
                // einem Hallenwechsel unsichtbar "hängen bleiben" und einen
                // in der neuen Halle gar nicht mehr existierenden Wert
                // übermitteln (serverseitig zwar abgefangen, siehe
                // pruefeAbteilNummer, aber ein verwirrendes UI-Verhalten).
                key={halleAusgewaehlt.id}
                id="tz-abteil"
                name="abteilNummer"
                // Kein required — ein Abteil zuzuweisen bleibt optional,
                // auch wenn die Halle unterteilt ist (siehe abteilNummer in
                // db/schema.ts).
                defaultValue={
                  eintrag?.abteilNummer != null ? String(eintrag.abteilNummer) : undefined
                }
                placeholder="Kein bestimmtes Abteil"
                options={Array.from(
                  { length: halleAusgewaehlt.abteilAnzahl },
                  (_, i) => i + 1
                ).map((n) => ({
                  value: String(n),
                  label: abteilLabel(halleAusgewaehlt, n),
                }))}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tz-wochentag">Wochentag</Label>
            <LabeledSelect
              id="tz-wochentag"
              name="wochentag"
              required
              defaultValue={String(wochentag)}
              options={WOCHENTAGE_LABEL.map((label, i) => ({
                value: String(i),
                label,
              }))}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="tz-start">Von</Label>
              <input
                id="tz-start"
                name="startZeit"
                type="time"
                step={900}
                required
                defaultValue={minutenZuZeitwert(startMinuten)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="tz-ende">Bis</Label>
              <input
                id="tz-ende"
                name="endeZeit"
                type="time"
                step={900}
                required
                defaultValue={minutenZuZeitwert(endMinuten)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Farbe</Label>
            <div className="flex flex-wrap gap-2">
              {TRAININGSFARBEN.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFarbe(f)}
                  aria-label={`Farbe ${f} wählen`}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                    farbe === f && "ring-2 ring-foreground"
                  )}
                  style={{ backgroundColor: f }}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            {bearbeiten && (
              <ConfirmSubmitButton
                formAction={trainingszeitLoeschen}
                variant="outline"
                confirmText="Diese Trainingszeit wirklich löschen?"
                pendingText="Wird gelöscht…"
                className="sm:mr-auto"
              >
                Löschen
              </ConfirmSubmitButton>
            )}
            <SubmitButton pendingText="Wird gespeichert…">Speichern</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
