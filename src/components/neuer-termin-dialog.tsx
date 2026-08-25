"use client";

import { createTermin } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
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
import { SubmitButton } from "@/components/submit-button";

// Vormals ein dauerhaft sichtbares Formular in einer eigenen Spalte neben
// der Tabelle — nahm auch dann Platz weg, wenn gerade nichts angelegt
// werden sollte. Jetzt hinter einem Button im Modal, analog zu
// NeuerFunktionstraegerDialog/TerminBearbeitenDialog.
export function NeuerTerminDialog({
  mannschaftsListe,
}: {
  mannschaftsListe: { id: string; name: string; altersklasse?: string | null }[];
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>Neuer Termin</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Termin</DialogTitle>
        </DialogHeader>

        <form action={createTermin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="typ">Typ</Label>
            <LabeledSelect
              id="typ"
              name="typ"
              defaultValue="testspiel"
              required
              options={[
                { value: "testspiel", label: "Freundschaftsspiel" },
                { value: "turnier", label: "Turnier" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="start">Start</Label>
            <Input id="start" name="start" type="datetime-local" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ende">Ende (optional)</Label>
            <Input id="ende" name="ende" type="datetime-local" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ort">Ort</Label>
            <Input id="ort" name="ort" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="beschreibung">Beschreibung / Gegner</Label>
            <Input id="beschreibung" name="beschreibung" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mannschaftId">Mannschaft (optional)</Label>
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

          <SubmitButton className="w-full">Anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
