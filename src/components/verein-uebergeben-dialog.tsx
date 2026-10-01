"use client";

import { vereinUebergeben } from "@/app/system/vereine/actions";
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

export function VereinUebergebenDialog({ vereinId, vereinName }: { vereinId: string; vereinName: string }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Übergeben</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vereinName} übergeben</DialogTitle>
          <DialogDescription>
            Der Vereinsadmin bekommt eine Mail mit Login-Link, der Verein wird sichtbar, und dein
            Zugriff endet sofort. Danach kommst du nur noch hinein, wenn der Verein dir den
            Support-Zugriff ausdrücklich freigibt.
          </DialogDescription>
        </DialogHeader>
        <form action={vereinUebergeben} className="flex flex-col gap-4">
          <input type="hidden" name="vereinId" value={vereinId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`uebergabe-name-${vereinId}`}>Name des Vereinsadmins</Label>
            <Input id={`uebergabe-name-${vereinId}`} name="adminName" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`uebergabe-email-${vereinId}`}>E-Mail des Vereinsadmins</Label>
            <Input id={`uebergabe-email-${vereinId}`} name="adminEmail" type="email" required />
          </div>
          <SubmitButton className="w-full" pendingText="Wird übergeben…">
            Jetzt übergeben
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
