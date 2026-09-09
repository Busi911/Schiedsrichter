"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";

export type BedarfEintrag = {
  // `${mannschaftId}|${rolle}` — eindeutig je Mannschaft+Rolle-Kombination.
  id: string;
  mannschaftLabel: string;
  rolleLabel: string;
  deaktiviert: boolean;
};

// Checkbox-Mehrfachauswahl für "Bedarf pro Mannschaft" auf den Wart-Seiten
// (Ordnerwart: Ordner+Kioskdienst, Zeitnehmerwart: Zeitnehmer/Sekretär) —
// gleiches Auswahl-Muster wie TerminMehrfachAuswahl (Checkbox + EIN
// gemeinsames Absenden für alle Ausgewählten), hier aber mit zwei
// Ziel-Aktionen (aktivieren/deaktivieren) statt einer, da die Auswahl anders
// als bei der Termin-Eintragung unabhängig vom aktuellen Zustand jedes
// Eintrags ist.
export function MannschaftBedarfAuswahl({
  eintraege,
  submitAction,
}: {
  eintraege: BedarfEintrag[];
  submitAction: (formData: FormData) => Promise<{ geaendert: number }>;
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());

  const [status, submitActionState] = useActionState(
    (_bisher: { geaendert: number } | null, formData: FormData) =>
      submitAction(formData),
    null
  );
  // State während des Renderns anpassen statt in einem Effect (siehe
  // gleiches Prinzip in mehrfachauswahl.tsx) — Auswahl nach erfolgreicher
  // Änderung zurücksetzen, damit sie nicht mit dem (jetzt veralteten)
  // deaktiviert-Zustand der Props kollidiert.
  const [verarbeiteterStatus, setVerarbeiteterStatus] = useState(status);
  if (status !== verarbeiteterStatus) {
    setVerarbeiteterStatus(status);
    if (status && status.geaendert > 0) {
      setAusgewaehlt(new Set());
    }
  }

  function toggle(id: string) {
    setAusgewaehlt((bisherige) => {
      const naechste = new Set(bisherige);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {ausgewaehlt.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="text-xs text-muted-foreground">
            {ausgewaehlt.size} {ausgewaehlt.size === 1 ? "Dienst" : "Dienste"}{" "}
            ausgewählt
          </span>
          <form action={submitActionState}>
            {[...ausgewaehlt].map((id) => (
              <input key={id} type="hidden" name="eintraege" value={id} />
            ))}
            <input type="hidden" name="deaktivieren" value="true" />
            <SubmitButton size="sm" variant="outline" pendingText="Wird deaktiviert…">
              Ausgewählte deaktivieren
            </SubmitButton>
          </form>
          <form action={submitActionState}>
            {[...ausgewaehlt].map((id) => (
              <input key={id} type="hidden" name="eintraege" value={id} />
            ))}
            <input type="hidden" name="deaktivieren" value="false" />
            <SubmitButton size="sm" variant="outline" pendingText="Wird aktiviert…">
              Ausgewählte aktivieren
            </SubmitButton>
          </form>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAusgewaehlt(new Set())}
          >
            Auswahl zurücksetzen
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {eintraege.map((e) => (
          <label
            key={e.id}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2 text-sm select-none"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ausgewaehlt.has(e.id)}
                onChange={() => toggle(e.id)}
              />
              {e.mannschaftLabel} — {e.rolleLabel}
            </span>
            <Badge variant={e.deaktiviert ? "outline" : "secondary"}>
              {e.deaktiviert ? "deaktiviert" : "aktiv"}
            </Badge>
          </label>
        ))}
      </div>
    </div>
  );
}
