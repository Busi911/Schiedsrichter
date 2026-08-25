"use client";

import { createFunktionstraeger } from "@/app/admin/actions";
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
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienstwart",
};

// Vormals ein dauerhaft sichtbares Formular in einer eigenen Spalte neben
// der Tabelle — nahm auch dann Platz weg, wenn gerade niemand angelegt
// werden sollte. Jetzt hinter einem Button im Modal, analog zu
// TerminBearbeitenDialog.
export function NeuerFunktionstraegerDialog({
  mannschaftsListe,
}: {
  mannschaftsListe: { id: string; name: string; altersklasse?: string | null }[];
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>Neuer Funktionsträger</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neuer Funktionsträger</DialogTitle>
        </DialogHeader>

        <form action={createFunktionstraeger} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Rollen (Mehrfachauswahl möglich)</Label>
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              {Object.entries(TYP_LABEL).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="typen"
                    value={value}
                    defaultChecked={value === "schiedsrichter"}
                    className="size-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="istAdmin" className="size-4" />
            Admin (voller Zugriff auf den Vereinsbereich)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="istAdminLesend" className="size-4" />
            Admin, nur lesend (sieht alles, kann nichts ändern)
          </label>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mannschaftId">Mannschaft (nur bei Trainer)</Label>
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

          <div className="flex items-center gap-3">
            <Switch name="sofortAktiv" id="sofortAktiv" defaultChecked />
            <Label htmlFor="sofortAktiv">
              Sofort aktivieren (Willkommens-Mail mit Login-Link senden)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Ohne Haken wird die Person ohne Login angelegt — die Mail geht
            erst raus, wenn sie später über &bdquo;Aktivieren&ldquo;
            freigeschaltet wird.
          </p>

          <SubmitButton className="w-full">Anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
