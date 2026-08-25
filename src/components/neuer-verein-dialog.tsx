"use client";

import { vereinErstellen } from "@/app/system/vereine/actions";
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
// der Tabelle — nahm auch dann Platz weg, wenn gerade kein Verein angelegt
// werden sollte. Jetzt hinter einem Button im Modal, analog zu
// NeuerFunktionstraegerDialog/NeuerTerminDialog/NeueMannschaftDialog.
export function NeuerVereinDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>Neuer Verein</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Verein</DialogTitle>
        </DialogHeader>

        <form action={vereinErstellen} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="vereinsname">Vereinsname</Label>
            <Input id="vereinsname" name="vereinsname" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adminName">Name des Admins</Label>
            <Input id="adminName" name="adminName" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adminEmail">E-Mail des Admins</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required />
          </div>
          <SubmitButton className="w-full">Verein anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
