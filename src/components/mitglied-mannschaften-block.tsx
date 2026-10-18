import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { MANNSCHAFT_ROLLEN } from "@/lib/mitglied-mannschaften";
import type { VereinsMannschaft, ZuordnungZeile } from "@/lib/mitglied-mannschaften-daten";
import { mitgliedMannschaftEntfernen, mitgliedMannschaftZuordnen } from "@/app/admin/(dashboard)/mitglieder/actions";

const SELECT_KLASSE =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Mannschaften eines Mitglieds (alle Saisons, neueste zuerst) und – für Admins mit Schreibzugriff – das Formular zum Zuordnen.
export function MitgliedMannschaftenBlock({
  mitgliedId,
  zuordnungen,
  mannschaften,
  saisons,
  aktuelleSaison,
  schreiben,
}: {
  mitgliedId: string;
  zuordnungen: ZuordnungZeile[];
  mannschaften: VereinsMannschaft[];
  saisons: string[];
  aktuelleSaison: string;
  schreiben: boolean;
}) {
  const name = new Map(mannschaften.map((m) => [m.id, m.name]));
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Mannschaften</p>
      {zuordnungen.length === 0 ? (
        <p className="text-muted-foreground">Keiner Mannschaft zugeordnet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {zuordnungen.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={z.saison === aktuelleSaison ? "secondary" : "outline"}>{z.saison}</Badge>
              <span>
                {name.get(z.mannschaftId) ?? "Mannschaft"} · {MANNSCHAFT_ROLLEN[z.rolle]}
              </span>
              {schreiben && (
                <form action={mitgliedMannschaftEntfernen}>
                  <input type="hidden" name="id" value={z.id} />
                  <SubmitButton variant="ghost" size="sm" className="min-h-11" pendingText="Entfernt…">
                    Entfernen
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {schreiben &&
        (mannschaften.length === 0 ? (
          <p className="text-muted-foreground">Zum Zuordnen braucht der Verein Mannschaften mit angebundenem Spielplan (Einstellungen → Öffentliche Vereinsseite).</p>
        ) : (
          <form action={mitgliedMannschaftZuordnen} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <input type="hidden" name="mitgliedId" value={mitgliedId} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Mannschaft</span>
              <select name="mannschaftId" required defaultValue="" className={SELECT_KLASSE}>
                <option value="" disabled>
                  Auswählen
                </option>
                {mannschaften.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Saison</span>
              <select name="saison" defaultValue={aktuelleSaison} className={SELECT_KLASSE}>
                {saisons.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Rolle</span>
              <select name="rolle" defaultValue="spieler" className={SELECT_KLASSE}>
                {Object.entries(MANNSCHAFT_ROLLEN).map(([wert, label]) => (
                  <option key={wert} value={wert}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton variant="outline" className="w-full sm:w-auto" pendingText="Ordnet zu…">
              Zuordnen
            </SubmitButton>
          </form>
        ))}
    </div>
  );
}
