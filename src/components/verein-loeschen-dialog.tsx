"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { vereinLoeschen } from "@/app/admin/(dashboard)/einstellungen/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Eigener Bestätigen-Button statt SubmitButton/ConfirmSubmitButton: muss
// zusätzlich zum Lade-Status (useFormStatus) auch den getippten Vereinsnamen
// berücksichtigen, disabled kombiniert also zwei Bedingungen statt nur einer.
function LoeschenButton({ freigeschaltet }: { freigeschaltet: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="destructive"
      disabled={pending || !freigeschaltet}
      className="w-full"
    >
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Wird gelöscht…" : "Verein endgültig löschen"}
    </Button>
  );
}

// Bewusst kein window.confirm() (siehe ConfirmSubmitButton) — bei diesem
// Ausmaß (der GESAMTE Verein inkl. aller Funktionsträger-Accounts,
// Mannschaften, Termine und Historie verschwindet unwiderruflich) muss der
// Vereinsname exakt eingetippt werden, ein reflexartiges "OK" in einem
// Browser-Dialog reicht nicht als Bestätigung.
export function VereinLoeschenDialog({ vereinsname }: { vereinsname: string }) {
  const [eingabe, setEingabe] = useState("");
  const freigeschaltet = eingabe === vereinsname;

  return (
    <Dialog
      onOpenChange={(offen) => {
        if (!offen) setEingabe("");
      }}
    >
      <DialogTrigger render={<Button variant="destructive" />}>
        Verein löschen
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verein endgültig löschen</DialogTitle>
          <DialogDescription>
            Löscht <strong>{vereinsname}</strong> unwiderruflich — inklusive
            aller Funktionsträger-Accounts, Mannschaften, Hallen, Termine,
            Zuordnungen und der gesamten Einsatz-Historie. Das kann nicht
            rückgängig gemacht werden. Ihr werdet danach automatisch
            ausgeloggt.
          </DialogDescription>
        </DialogHeader>

        <form action={vereinLoeschen} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bestaetigterVereinsname">
              Tippt zur Bestätigung „{vereinsname}“ ein
            </Label>
            <Input
              id="bestaetigterVereinsname"
              name="bestaetigterVereinsname"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              autoComplete="off"
            />
          </div>
          <LoeschenButton freigeschaltet={freigeschaltet} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
