"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

// Für Formular-Buttons, die eine Zuordnung entfernen/ersetzen — ein Fehlklick
// wirkt sonst sofort serverseitig, ohne Rückfrage oder Undo. window.confirm
// reicht hier aus (kein eigener Dialog nötig) und funktioniert innerhalb
// eines <form action={serverAction}>: bricht der Nutzer ab, verhindert
// preventDefault auf dem Klick-Event das Submit. useFormStatus wie in
// SubmitButton, damit auch bestätigte Aktionen einen Spinner zeigen statt
// nur ein reaktionsloses Warten bis zum Server-Roundtrip.
export function ConfirmSubmitButton({
  confirmText,
  onClick,
  children,
  pendingText,
  ...props
}: ComponentProps<typeof Button> & {
  confirmText: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmText)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      {pending ? (pendingText ?? "Wird ausgeführt…") : children}
    </Button>
  );
}
