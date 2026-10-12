"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { trainerEintragen } from "./actions";

export function TrainerEintragenFormular({ token, mannschaftName }: { token: string; mannschaftName: string }) {
  const [ergebnis, formAction] = useActionState(trainerEintragen, null);

  if (ergebnis?.ok) {
    return (
      <p className="text-base">
        Danke — deine Eintragung als Trainer von <strong>{ergebnis.mannschaftName}</strong> ist eingegangen. Sobald der Vereinsadmin dich freigeschaltet
        hat, bekommst du eine Mail mit deinem Zugang.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Dein Name</Label>
        <Input id="name" name="name" autoComplete="name" required maxLength={100} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Deine E-Mail-Adresse</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </div>
      {ergebnis && !ergebnis.ok && <p className="text-sm text-destructive">{ergebnis.fehler}</p>}
      <SubmitButton className="w-full" pendingText="Wird eingetragen…">
        Als Trainer von {mannschaftName} eintragen
      </SubmitButton>
    </form>
  );
}
