import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Unterbereich } from "@/components/einstellungs-bereich";
import { geltungsText, MAX_BEDARF } from "@/lib/eigene-dienste";
import type { DienstArtMitDetails } from "@/lib/eigene-dienste-daten";
import {
  dienstArtAktivSetzen,
  dienstArtLoeschen,
  dienstArtSpeichern,
} from "@/app/admin/(dashboard)/einstellungen/eigene-dienste-actions";

type Mannschaft = { id: string; name: string };

// Einstellungen → "Eigene Dienste": je Dienst ein aufklappbares Formular, darunter "Neuer Dienst". Bewusst ohne Client-JS
// (natives <details>, Radio + Checkboxen), wie der Rest der Einstellungsseite.
export function EigeneDiensteEinstellungen({
  arten,
  mannschaften,
  eingeteilt,
  schreibzugriff,
}: {
  arten: DienstArtMitDetails[];
  mannschaften: Mannschaft[];
  // dienstArtId -> Zahl der Einteilungen (Löschen nur bei 0)
  eingeteilt: Map<string, number>;
  schreibzugriff: boolean;
}) {
  const namen = new Map(mannschaften.map((m) => [m.id, m.name]));
  return (
    <div className="flex flex-col gap-1">
      {arten.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine eigenen Dienste angelegt.</p>
      )}
      {arten.map((d) => (
        <Unterbereich
          key={d.id}
          titel={d.aktiv ? d.name : `${d.name} (deaktiviert)`}
          kurz={geltungsText(d, namen)}
        >
          <DienstFormular dienst={d} mannschaften={mannschaften} schreibzugriff={schreibzugriff} />
          {schreibzugriff && (
            <div className="flex flex-wrap gap-2">
              <form action={dienstArtAktivSetzen}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="aktiv" value={d.aktiv ? "false" : "true"} />
                <SubmitButton variant="outline" size="sm" pendingText="Wird gespeichert…">
                  {d.aktiv ? "Deaktivieren" : "Wieder aktivieren"}
                </SubmitButton>
              </form>
              {(eingeteilt.get(d.id) ?? 0) === 0 ? (
                <form action={dienstArtLoeschen}>
                  <input type="hidden" name="id" value={d.id} />
                  <ConfirmSubmitButton variant="ghost" size="sm" confirmText={`Dienst „${d.name}“ wirklich löschen?`}>
                    Löschen
                  </ConfirmSubmitButton>
                </form>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  {eingeteilt.get(d.id)} Einteilung(en) vorhanden, deshalb nur deaktivierbar.
                </p>
              )}
            </div>
          )}
        </Unterbereich>
      ))}
      {schreibzugriff && (
        <Unterbereich titel="Neuer Dienst" kurz="z.B. Fahrer, Kuchen, Aufbau, Abbau" offen={arten.length === 0}>
          <DienstFormular mannschaften={mannschaften} schreibzugriff />
        </Unterbereich>
      )}
    </div>
  );
}

function DienstFormular({
  dienst,
  mannschaften,
  schreibzugriff,
}: {
  dienst?: DienstArtMitDetails;
  mannschaften: Mannschaft[];
  schreibzugriff: boolean;
}) {
  const p = dienst?.id ?? "neu";
  return (
    <form action={dienstArtSpeichern} className="flex flex-col gap-4">
      <fieldset disabled={!schreibzugriff} className="flex flex-col gap-4">
        {dienst && <input type="hidden" name="id" value={dienst.id} />}
        {/* Auswärtsspiele gibt es als Termine erst mit der Auswärts-Anlage; bis dahin bleibt der gespeicherte Wert unverändert. */}
        {dienst?.fuerAuswaertsspiele && <input type="hidden" name="fuerAuswaertsspiele" value="on" />}
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${p}`}>Name</Label>
            <Input id={`name-${p}`} name="name" required maxLength={40} defaultValue={dienst?.name ?? ""} placeholder="z.B. Fahrer" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`bedarf-${p}`}>Je Termin</Label>
            <Input
              id={`bedarf-${p}`}
              name="standardBedarf"
              type="number"
              min="0"
              max={MAX_BEDARF}
              step="1"
              required
              defaultValue={dienst?.standardBedarf ?? 1}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`beschreibung-${p}`}>Hinweis für die Helfer (optional)</Label>
          <Input
            id={`beschreibung-${p}`}
            name="beschreibung"
            maxLength={300}
            defaultValue={dienst?.beschreibung ?? ""}
            placeholder="z.B. Treffpunkt 30 Minuten vor Abfahrt an der Halle"
          />
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Gilt für</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="fuerHeimspiele" defaultChecked={dienst?.fuerHeimspiele ?? true} />
              Heimspiele
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="fuerFreundschaftsspiele" defaultChecked={dienst?.fuerFreundschaftsspiele ?? false} />
              Freundschaftsspiele
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="fuerTurniere" defaultChecked={dienst?.fuerTurniere ?? false} />
              Turniere
            </label>
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">Mannschaften</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="mannschaftsModus" value="alle" defaultChecked={!dienst?.nurAusgewaehlteMannschaften} />
            Alle Mannschaften
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="mannschaftsModus" value="auswahl" defaultChecked={!!dienst?.nurAusgewaehlteMannschaften} />
            Nur diese Mannschaften:
          </label>
          {mannschaften.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Mannschaften angelegt.</p>
          ) : (
            <div className="grid gap-x-4 sm:grid-cols-2">
              {mannschaften.map((m) => (
                <label key={m.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="mannschaftIds"
                    value={m.id}
                    defaultChecked={!!dienst?.nurAusgewaehlteMannschaften && dienst.mannschaftIds.includes(m.id)}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {schreibzugriff && (
          <SubmitButton className="self-start" pendingText="Wird gespeichert…">
            {dienst ? "Speichern" : "Dienst anlegen"}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  );
}
