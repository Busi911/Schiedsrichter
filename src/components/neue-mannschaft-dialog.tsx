"use client";

import { createMannschaft } from "@/app/admin/(dashboard)/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnlegenDialog } from "@/components/anlegen-dialog";

// Vormals ein dauerhaft sichtbares Formular in einer eigenen Spalte neben
// der Tabelle — nahm auch dann Platz weg, wenn gerade kein Team angelegt
// werden sollte. Jetzt hinter einem Button im Modal, analog zu
// NeuerFunktionstraegerDialog/NeuerTerminDialog.
export function NeueMannschaftDialog() {
  return (
    <AnlegenDialog
      triggerLabel="Neue Mannschaft"
      title="Neue Mannschaft"
      action={createMannschaft}
      erfolgText={(fd) => `Mannschaft „${String(fd.get("name") ?? "").trim()}“ angelegt.`}
    >
    <div className="flex flex-col gap-2">
      <Label htmlFor="name">Name</Label>
      <Input id="name" name="name" required />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="altersklasse">Altersklasse (optional)</Label>
      <Input id="altersklasse" name="altersklasse" />
    </div>
    <div className="flex flex-col gap-2">
      <Label htmlFor="handballNetTeamId">
        handball.net-Team-ID (optional, ab 3. Liga)
      </Label>
      <Input
        id="handballNetTeamId"
        name="handballNetTeamId"
        inputMode="numeric"
        placeholder="z.B. 69770"
      />
    </div>
    </AnlegenDialog>
  );
}
