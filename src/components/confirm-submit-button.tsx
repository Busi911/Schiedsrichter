"use client";

import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

// Für Formular-Buttons, die eine Zuordnung entfernen/ersetzen — ein Fehlklick
// wirkt sonst sofort serverseitig, ohne Rückfrage oder Undo. window.confirm
// reicht hier aus (kein eigener Dialog nötig) und funktioniert innerhalb
// eines <form action={serverAction}>: bricht der Nutzer ab, verhindert
// preventDefault auf dem Klick-Event das Submit.
export function ConfirmSubmitButton({
  confirmText,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { confirmText: string }) {
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmText)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    />
  );
}
