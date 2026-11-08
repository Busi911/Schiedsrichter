"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/submit-button";
import { useUngespeichertWarnung } from "@/components/ungespeichert-warnung";

// Gemeinsamer Rahmen für „Neu anlegen“-Dialoge (Mannschaft, Termin, Funktionsträger).
// Nach dem Speichern schließt der Dialog und eine kurze Bestätigung steht neben dem Button
// (vorher blieb er mit geleerten Feldern offen, der Erfolg war leicht zu übersehen).
// „Und weiteren anlegen“ lässt ihn offen, leert die Felder und bestätigt im Dialog.
// Die Liste dahinter aktualisiert die Server Action selbst (revalidatePath).
export function AnlegenDialog({
  triggerLabel,
  title,
  action,
  erfolgText,
  children,
}: {
  triggerLabel: string;
  title: string;
  /** Server Action; Fehler werden wie bisher von der Fehlerseite angezeigt. */
  action: (formData: FormData) => Promise<unknown>;
  /** Bestätigungstext, bekommt die Eingaben (z.B. für den Namen). */
  erfolgText: (formData: FormData) => string;
  children: React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [imDialog, setImDialog] = useState<string | null>(null);
  const warnung = useUngespeichertWarnung();

  // Bestätigung neben dem Button verschwindet nach einigen Sekunden von selbst.
  useEffect(() => {
    if (!meldung) return;
    const t = setTimeout(() => setMeldung(null), 8000);
    return () => clearTimeout(t);
  }, [meldung]);

  async function speichern(formData: FormData) {
    const weiter = formData.get("weiter") === "1";
    const text = erfolgText(formData);
    await action(formData);
    warnung.zuruecksetzen();
    if (weiter) {
      setImDialog(text);
    } else {
      setImDialog(null);
      setMeldung(text);
      setOffen(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Dialog
        open={offen}
        onOpenChange={(o) => {
          // Schließen mit ausgefüllten Feldern: erst nachfragen, damit nichts versehentlich verloren geht.
          if (!o && !warnung.darfSchliessen()) return;
          setOffen(o);
          if (!o) warnung.zuruecksetzen();
          if (o) {
            setMeldung(null);
            setImDialog(null);
          }
        }}
      >
        <DialogTrigger render={<Button />}>{triggerLabel}</DialogTrigger>
        <DialogContent className="sm:max-w-md" onInput={warnung.markiereGeaendert}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {imDialog && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
            >
              <Check className="size-4 shrink-0" aria-hidden />
              {imDialog} Du kannst gleich den nächsten eintragen.
            </p>
          )}

          <form action={speichern} className="flex flex-col gap-4">
            {children}
            <div className="flex flex-col gap-2 sm:flex-row">
              <SubmitButton className="w-full sm:flex-1">Anlegen</SubmitButton>
              <SubmitButton
                name="weiter"
                value="1"
                variant="outline"
                className="w-full sm:flex-1"
              >
                Und weiteren anlegen
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {meldung && (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <Check className="size-4" aria-hidden />
          {meldung}
        </span>
      )}
    </span>
  );
}
