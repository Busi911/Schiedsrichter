"use client";

import { createTermin } from "@/app/admin/(dashboard)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { AnlegenDialog } from "@/components/anlegen-dialog";

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
    <AnlegenDialog
      triggerLabel="Neuer Termin"
      title="Neuer Termin"
      action={createTermin}
      erfolgText={() => "Termin angelegt."}
    >
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
    </AnlegenDialog>
  );
}
