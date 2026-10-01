"use client";

import { vereinVorbereiten } from "@/app/system/vereine/actions";
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
import { SubmitButton } from "@/components/submit-button";

// Verein im Hintergrund einrichten, ohne Admin. Er ist unsichtbar und
// verschickt keine Mails, bis er übergeben wird.
export function VereinVorbereitenDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Verein vorbereiten</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verein vorbereiten</DialogTitle>
          <DialogDescription>
            Du richtest den Verein selbst ein, ohne dass jemand davon erfährt: nicht öffentlich
            sichtbar, keine Mails. Danach übergibst du ihn an den echten Vereinsadmin.
          </DialogDescription>
        </DialogHeader>
        <form action={vereinVorbereiten} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="vorbereiten-vereinsname">Vereinsname</Label>
            <Input id="vorbereiten-vereinsname" name="vereinsname" required />
          </div>
          <SubmitButton className="w-full" pendingText="Wird angelegt…">
            Anlegen und einrichten
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
