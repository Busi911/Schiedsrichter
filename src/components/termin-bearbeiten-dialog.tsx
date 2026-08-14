"use client";

import { deleteTermin, updateTermin } from "@/app/admin/actions";
import { toDatetimeLocalWert } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";

type Termin = {
  id: string;
  typ: string;
  start: Date;
  ende: Date | null;
  ort: string | null;
  beschreibung: string | null;
  mannschaftId: string | null;
  turnierVerantwortlicherId: string | null;
};

// Vormals ein dauerhaft sichtbarer "Details"-Block direkt unter der
// Überschrift — nahm auf einer Seite, deren eigentlicher Inhalt der
// Spielplan ist, unverhältnismäßig viel Platz ein. Jetzt hinter einem
// Bearbeiten-Button im Modal, analog zum Kalender-Modal (siehe
// monats-kalender.tsx).
export function TerminBearbeitenDialog({
  termin,
  mannschaftsListe,
  trainerListe,
  istTurnier,
}: {
  termin: Termin;
  mannschaftsListe: { id: string; name: string; altersklasse: string | null }[];
  trainerListe: { userId: string; name: string | null; email: string }[];
  istTurnier: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        {istTurnier ? "Turnier bearbeiten" : "Termin bearbeiten"}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {istTurnier ? "Turnier bearbeiten" : "Termin bearbeiten"}
          </DialogTitle>
        </DialogHeader>

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
            <Label htmlFor="start">{istTurnier ? "Beginn" : "Start"}</Label>
            <Input
              id="start"
              name="start"
              type="datetime-local"
              defaultValue={toDatetimeLocalWert(termin.start)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ende">Ende (optional)</Label>
            <Input
              id="ende"
              name="ende"
              type="datetime-local"
              defaultValue={termin.ende ? toDatetimeLocalWert(termin.ende) : ""}
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
                label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
              }))}
            />
          </div>

          {istTurnier && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="turnierVerantwortlicherId">
                Turnierverantwortlicher (optional)
              </Label>
              <LabeledSelect
                id="turnierVerantwortlicherId"
                name="turnierVerantwortlicherId"
                placeholder="— (nur Admin verwaltet)"
                defaultValue={termin.turnierVerantwortlicherId ?? undefined}
                options={trainerListe.map((t) => ({
                  value: t.userId,
                  label: t.name ?? t.email,
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Darf zusätzlich zum Admin diesen Spielplan pflegen und
                Ergebnisse eintragen (unter &quot;Meine Termine&quot;).
              </p>
            </div>
          )}

          <Button type="submit" className="w-full">
            Speichern
          </Button>
        </form>

        <div className="flex justify-end border-t pt-4">
          <form action={deleteTermin}>
            <input type="hidden" name="terminId" value={termin.id} />
            <ConfirmSubmitButton
              confirmText={`${istTurnier ? "Turnier" : "Termin"} wirklich unwiderruflich löschen?`}
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              {istTurnier ? "Turnier löschen" : "Termin löschen"}
            </ConfirmSubmitButton>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
