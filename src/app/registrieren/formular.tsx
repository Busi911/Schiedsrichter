"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { vereinRegistrieren } from "./actions";

// useActionState statt einer einfachen <form action={...}> (wie sonst in
// der App üblich, siehe CLAUDE.md), weil das Ergebnis hier zwei
// unterschiedliche Ausgänge hat (sofort registriert vs. Warteliste), die
// beide auf DERSELBEN Seite angezeigt werden müssen, statt nur bei einem
// Fehler in ein generisches Error-Overlay zu laufen.
export function RegistrierenFormular({ kostenpflichtig = false }: { kostenpflichtig?: boolean }) {
  const [ergebnis, formAction] = useActionState(
    async (_zustand: unknown, formData: FormData) => vereinRegistrieren(formData),
    null
  );

  if (ergebnis && "ergebnis" in ergebnis && ergebnis.ergebnis === "registriert") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Geschafft — euer Verein ist angelegt. Ihr bekommt gleich eine Mail
          mit dem Login-Link.
        </p>
        <Button render={<Link href="/login" />} nativeButton={false}>
          Zum Login
        </Button>
      </div>
    );
  }

  if (ergebnis && "ergebnis" in ergebnis && ergebnis.ergebnis === "warteliste") {
    return (
      <p className="text-sm">
        Die Beta ist gerade voll — ihr steht jetzt auf der Warteliste und
        werdet benachrichtigt, sobald ein Platz frei wird.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="vereinsname">Vereinsname</Label>
        <Input id="vereinsname" name="vereinsname" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adminName">Dein Name</Label>
        <Input id="adminName" name="adminName" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="adminEmail">Deine E-Mail-Adresse</Label>
        <Input id="adminEmail" name="adminEmail" type="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="strasse">Straße und Hausnummer</Label>
        <Input id="strasse" name="strasse" required />
      </div>
      <div className="flex gap-3">
        <div className="flex w-28 flex-col gap-2">
          <Label htmlFor="plz">PLZ</Label>
          <Input id="plz" name="plz" required inputMode="numeric" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="ort">Ort</Label>
          <Input id="ort" name="ort" required />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rechnungEmail">
          E-Mail des Verantwortlichen für die Rechnung{kostenpflichtig ? "" : " (optional)"}
        </Label>
        <Input id="rechnungEmail" name="rechnungEmail" type="email" required={kostenpflichtig} />
      </div>
      <p className="text-xs text-muted-foreground">
        Adresse und E-Mail brauchen wir für die Rechnung — einmal hier eintragen statt separat nachfragen.
        {kostenpflichtig
          ? " Die Rechnung kommt per E-Mail, Zahlungsziel 30 Tage."
          : " Wer in der Beta-Phase dabei ist, bekommt die erste Rechnung ab 1.12.2026."}
      </p>
      {ergebnis && "fehler" in ergebnis && (
        <p className="text-sm text-destructive">{ergebnis.fehler}</p>
      )}
      <SubmitButton className="w-full">Verein registrieren</SubmitButton>
    </form>
  );
}
