"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Submit-Button für Formulare mit MEHREREN Absende-Wegen (z.B. Login: Passwort ODER Login-Link): Der Lade-Spinner erscheint nur am
// Button, der tatsächlich gedrückt wurde (gemerkt per onClick — name/value taugen dafür nicht, React ersetzt den name bei einer
// Server Action per formAction durch eine eigene Referenz), alle Buttons sind währenddessen gesperrt.
export function ModusButton({
  pendingText,
  children,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  const [geklickt, setGeklickt] = useState(false);
  if (!pending && geklickt) setGeklickt(false);
  const aktiv = pending && geklickt;
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        setGeklickt(true);
        onClick?.(e);
      }}
      {...props}
    >
      {aktiv && <Loader2 className="animate-spin" />}
      {aktiv ? (pendingText ?? "Wird ausgeführt…") : children}
    </Button>
  );
}
