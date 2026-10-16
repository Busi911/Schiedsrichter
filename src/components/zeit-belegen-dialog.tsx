"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { SubmitButton } from "@/components/submit-button";
import { SchliesseNachSpeichern } from "@/components/trainingszeit-dialog";
import { trainingBelegen } from "@/app/profil/training/actions";

// "Zeit belegen": öffnet ein Fenster, in dem eine Mannschaft die frei gewordene Zeit bucht (wer zuerst bucht, bekommt sie). Zur Wahl stehen nur die Mannschaften, für die
// die Person buchen darf (Trainer: die eigenen, Admin: jede andere). Bei nur einer Möglichkeit ist sie vorgegeben.
export function ZeitBelegenDialog({
  trainingszeitId,
  datum,
  beschreibung,
  optionen,
  ort,
}: {
  trainingszeitId: string;
  datum: string;
  beschreibung: string; // z.B. "Donnerstag, 22.10., 18:00–19:30 Uhr"
  optionen: { id: string; label: string }[];
  ort: string;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogTrigger render={<Button size="sm" className="min-h-11 w-full sm:w-auto" />}>Zeit belegen</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Frei gewordene Zeit belegen</DialogTitle>
          <DialogDescription>
            {beschreibung} · {ort}. Wer zuerst bucht, bekommt die Zeit; die ausfallende Mannschaft und die Admins erfahren es per Mail.
          </DialogDescription>
        </DialogHeader>
        <form action={trainingBelegen} className="flex flex-col gap-3">
          <SchliesseNachSpeichern onFertig={() => setOffen(false)} />
          <input type="hidden" name="trainingszeitId" value={trainingszeitId} />
          <input type="hidden" name="datum" value={datum} />
          {optionen.length === 1 ? (
            <>
              <input type="hidden" name="mannschaftId" value={optionen[0].id} />
              <p className="text-sm">
                Es trainiert: <strong>{optionen[0].label}</strong>
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`belegen-mannschaft-${trainingszeitId}-${datum}`}>Welche Mannschaft nutzt die Zeit?</Label>
              <LabeledSelect
                id={`belegen-mannschaft-${trainingszeitId}-${datum}`}
                name="mannschaftId"
                required
                placeholder="Mannschaft wählen…"
                options={optionen.map((o) => ({ value: o.id, label: o.label }))}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`belegen-notiz-${trainingszeitId}-${datum}`}>Notiz (optional)</Label>
            <Input id={`belegen-notiz-${trainingszeitId}-${datum}`} name="notiz" maxLength={200} placeholder="z.B. Testspiel-Vorbereitung" />
          </div>
          <DialogFooter>
            <SubmitButton pendingText="Wird gebucht…">Verbindlich belegen</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
