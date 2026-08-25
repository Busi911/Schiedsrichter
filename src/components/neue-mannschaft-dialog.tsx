"use client";

import { createMannschaft } from "@/app/admin/actions";
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
import { SubmitButton } from "@/components/submit-button";

// Vormals ein dauerhaft sichtbares Formular in einer eigenen Spalte neben
// der Tabelle — nahm auch dann Platz weg, wenn gerade kein Team angelegt
// werden sollte. Jetzt hinter einem Button im Modal, analog zu
// NeuerFunktionstraegerDialog/NeuerTerminDialog.
export function NeueMannschaftDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>Neue Mannschaft</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Mannschaft</DialogTitle>
        </DialogHeader>

        <form action={createMannschaft} className="flex flex-col gap-4">
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
          <SubmitButton className="w-full">Anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
