import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DisclosureSummary } from "@/components/disclosure-summary";
import { fahrtText, MAX_PLAETZE, mitfahrerMoeglich } from "@/lib/fahrgemeinschaft";
import { fahrtSpeichern, mitfahrerEntfernen, mitfahrerHinzufuegen } from "@/app/profil/fahrgemeinschaft-actions";

// Fahrgemeinschaft je eingeteilter Person (lib/fahrgemeinschaft.ts): Kurztext, Mitfahrer mit Entfernen, Mitfahrer hinzufügen und
// (aufklappbar) freie Plätze + Treffpunkt. Genutzt auf /profil/dienstwart (Wart/Admin) und im Profil (die Person selbst).
export function FahrtBearbeiten({
  zuordnungId,
  plaetze,
  fahrtHinweis,
  mitfahrer,
}: {
  zuordnungId: string;
  plaetze: number | null;
  fahrtHinweis: string | null;
  mitfahrer: { id: string; name: string }[];
}) {
  const fahrt = { plaetze, mitfahrer: mitfahrer.map((m) => m.name), hinweis: fahrtHinweis };
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 text-sm">
      <p className="text-xs text-muted-foreground">Mitfahrplätze: {fahrtText(fahrt)}</p>
      {mitfahrer.length > 0 && (
        <ul className="flex flex-col gap-1">
          {mitfahrer.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span>{m.name}</span>
              <form action={mitfahrerEntfernen}>
                <input type="hidden" name="mitfahrerId" value={m.id} />
                <ConfirmSubmitButton className="h-11 px-3 text-sm" variant="ghost" confirmText={`${m.name} als Mitfahrer entfernen?`}>
                  Entfernen
                </ConfirmSubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      {mitfahrerMoeglich(fahrt) && (
        <form action={mitfahrerHinzufuegen} className="flex gap-2">
          <input type="hidden" name="zuordnungId" value={zuordnungId} />
          <Input name="name" placeholder="Mitfahrer (Name)" maxLength={60} required className="h-11 min-w-0 flex-1" aria-label="Name des Mitfahrers" />
          <SubmitButton className="h-11 px-4 text-sm" variant="outline" pendingText="…">
            Hinzufügen
          </SubmitButton>
        </form>
      )}
      <details className="group" open={plaetze === null}>
        <DisclosureSummary className="h-11 px-4 text-sm">
          <span className="group-open:hidden">Plätze/Treffpunkt ändern</span>
          <span className="hidden group-open:inline">Plätze/Treffpunkt</span>
        </DisclosureSummary>
        <form action={fahrtSpeichern} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="zuordnungId" value={zuordnungId} />
          <Input
            name="plaetze"
            type="number"
            min="0"
            max={MAX_PLAETZE}
            step="1"
            defaultValue={plaetze ?? ""}
            placeholder="Freie Plätze"
            aria-label="Freie Plätze im Auto (ohne Fahrer)"
            className="h-11 sm:w-32"
          />
          <Input
            name="fahrtHinweis"
            maxLength={200}
            defaultValue={fahrtHinweis ?? ""}
            placeholder="z.B. Treffpunkt Halle 13:15"
            aria-label="Treffpunkt oder Hinweis"
            className="h-11 sm:flex-1"
          />
          <SubmitButton className="h-11 px-4 text-sm" variant="outline" pendingText="Wird gespeichert…">
            Speichern
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
