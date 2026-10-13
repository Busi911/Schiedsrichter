import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GESPERRTE_FELDER, STAMMDATEN_FELDER } from "@/lib/stammdaten-felder";
import { stammdatenAenderungBeantragen } from "@/app/admin/(dashboard)/einstellungen/actions";

type Antrag = { id: string; feld: string; neuerWert: string | null; status: string; entscheidungNotiz: string | null };

const STATUS_TEXT: Record<string, string> = { offen: "wird geprüft", genehmigt: "übernommen", abgelehnt: "abgelehnt" };

// Erscheint statt der Eingabe, sobald für einen Termin ein Dienst eingetragen ist (zugeordnet oder selbst eingetragen): Vereins-/Team-IDs und Zusatzquellen lassen sich dann nicht
// mehr direkt ändern (Termine und Dienste hängen daran), eine Änderung geht mit Grund an den Systemadmin.
export function StammdatenAntrag({ antraege, antragOk }: { antraege: Antrag[]; antragOk: boolean }) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-sm font-medium">Vereins-IDs sind gesperrt</p>
      <p className="text-xs text-muted-foreground">
        Weil für Termine bereits Dienste eingetragen sind, lassen sich die Vereins- und Team-IDs und die weiteren Vereine (Spielgemeinschaft) nicht mehr direkt ändern — sonst könnten eingeteilte Dienste verloren gehen. Hallen-IDs und eure Spielhallen könnt ihr weiterhin selbst ändern.
        Wenn sich wirklich etwas ändern muss (z.B. falsche ID), beantragt es hier mit kurzer Begründung; wir prüfen es und setzen es um.
      </p>
      {antragOk && <p className="rounded-md border bg-muted p-2 text-sm">Antrag gesendet. Ihr bekommt eine Mail, sobald er geprüft ist.</p>}
      <form action={stammdatenAenderungBeantragen} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="antragFeld">Was soll geändert werden?</Label>
          <select
            id="antragFeld"
            name="feld"
            required
            defaultValue=""
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="" disabled>
              Bitte wählen …
            </option>
            {GESPERRTE_FELDER.map((wert) => (
              <option key={wert} value={wert}>
                {STAMMDATEN_FELDER[wert]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="antragWert">Neuer Wert</Label>
          <Input id="antragWert" name="neuerWert" maxLength={500} placeholder="z.B. 76446 (bei „Sonstiges“: kurz beschreiben)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="antragGrund">Grund</Label>
          <textarea
            id="antragGrund"
            name="grund"
            required
            minLength={10}
            maxLength={1000}
            rows={3}
            placeholder="Warum muss das geändert werden?"
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <SubmitButton size="sm" className="self-start" pendingText="Wird gesendet…">
          Änderung beantragen
        </SubmitButton>
      </form>
      {antraege.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {antraege.map((a) => (
            <li key={a.id} className="break-words">
              {STAMMDATEN_FELDER[a.feld as keyof typeof STAMMDATEN_FELDER] ?? a.feld} → {a.neuerWert || "—"}: {STATUS_TEXT[a.status] ?? a.status}
              {a.entscheidungNotiz ? ` („${a.entscheidungNotiz}“)` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
