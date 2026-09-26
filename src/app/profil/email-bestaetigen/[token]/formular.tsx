"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { emailAenderungBestaetigen } from "./actions";

// useActionState statt einer einfachen <form action={...}> (wie sonst in
// der App üblich), weil das Ergebnis (Erfolg mit neuer Adresse, oder ein
// Fehlertext wie "Link abgelaufen") HIER auf der Seite angezeigt werden
// muss — ein login-freier Bestätigungslink hat keine Session, in die eine
// Fehlermeldung sonst über den normalen Next.js-Error-Overlay-Weg münden
// könnte.
export function EmailBestaetigenFormular({ token }: { token: string }) {
  const [ergebnis, formAction] = useActionState(
    async (_zustand: unknown, formData: FormData) =>
      emailAenderungBestaetigen(formData),
    null
  );

  if (ergebnis && "neueEmail" in ergebnis) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Erledigt — du kannst dich ab sofort mit{" "}
          <strong>{ergebnis.neueEmail}</strong> einloggen.
        </p>
        <Button render={<Link href="/login" />} nativeButton={false}>
          Zum Login
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {ergebnis && "fehler" in ergebnis && (
        <p className="text-sm text-destructive">{ergebnis.fehler}</p>
      )}
      <SubmitButton className="w-full">Bestätigen</SubmitButton>
    </form>
  );
}
