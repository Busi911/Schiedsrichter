import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toDatetimeLocalWert } from "@/lib/format";
import { ARTEN, ROLLEN, SICHTBARKEITEN } from "@/lib/vereinstermine";
import { WIEDERHOLUNGEN, istWiederholung, serienText } from "@/lib/wiederholung";

export type FormularPerson = { id: string; label: string };
export type FormularWerte = {
  id: string;
  titel: string;
  art: string;
  beschreibung: string | null;
  ort: string | null;
  start: Date;
  ende: Date | null;
  sichtbarkeit: string;
  rollen: string[];
  personen: string[];
  antwortAbfrage: boolean;
  serieId?: string | null;
  wiederholung?: string | null;
};

const SELECT_KLASSE =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Formular zum Anlegen und Bearbeiten eines Vereinstermins (Server Component, ohne Client-JS). Die Auswahl (Rollen/Personen) gilt nur bei
// "Auswahl" — bei den anderen Einstellungen wird sie beim Speichern verworfen (pruefeVereinstermin).
export function VereinsterminFormular({
  action,
  personen,
  werte,
  absenden,
  informierenText,
  idPraefix,
}: {
  action: (formData: FormData) => Promise<void>;
  personen: FormularPerson[];
  werte?: FormularWerte;
  absenden: string;
  informierenText: string;
  idPraefix: string;
}) {
  const f = (name: string) => `${idPraefix}-${name}`;
  const sichtbarkeit = werte?.sichtbarkeit ?? "alle";
  return (
    <form action={action} className="flex flex-col gap-4">
      {werte && <input type="hidden" name="id" value={werte.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("titel")}>Titel</Label>
          <Input id={f("titel")} name="titel" required maxLength={120} defaultValue={werte?.titel} placeholder="z.B. Vorstandssitzung" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("art")}>Art</Label>
          <select id={f("art")} name="art" defaultValue={werte?.art ?? "sitzung"} className={SELECT_KLASSE}>
            {Object.entries(ARTEN).map(([schluessel, label]) => (
              <option key={schluessel} value={schluessel}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("start")}>Beginn</Label>
          <Input id={f("start")} name="start" type="datetime-local" required defaultValue={werte ? toDatetimeLocalWert(werte.start) : undefined} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("ende")}>Ende (optional)</Label>
          <Input id={f("ende")} name="ende" type="datetime-local" defaultValue={werte?.ende ? toDatetimeLocalWert(werte.ende) : undefined} />
        </div>
      </div>
      {!werte && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f("wiederholung")}>Wiederholung</Label>
            <select id={f("wiederholung")} name="wiederholung" defaultValue="" className={SELECT_KLASSE}>
              <option value="">Keine (einmaliger Termin)</option>
              {Object.entries(WIEDERHOLUNGEN).map(([schluessel, label]) => (
                <option key={schluessel} value={schluessel}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f("bis")}>Wiederholen bis (nur bei Wiederholung)</Label>
            <Input id={f("bis")} name="bis" type="date" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Jeder Termin der Serie wird einzeln angelegt (höchstens 52), Zu- und Absagen gibt es je Termin. Die Eingeladenen bekommen nur eine Mail für die ganze Serie.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={f("ort")}>Ort (optional)</Label>
        <Input id={f("ort")} name="ort" maxLength={200} defaultValue={werte?.ort ?? ""} placeholder="z.B. Vereinsheim" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={f("beschreibung")}>Beschreibung (optional)</Label>
        <Textarea id={f("beschreibung")} name="beschreibung" maxLength={2000} defaultValue={werte?.beschreibung ?? ""} placeholder="Tagesordnung, Hinweise …" />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Wer darf den Termin sehen?</legend>
        {Object.entries(SICHTBARKEITEN).map(([schluessel, label]) => (
          <label key={schluessel} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="sichtbarkeit" value={schluessel} defaultChecked={sichtbarkeit === schluessel} />
            {label}
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Vereinsadmins sehen jeden Vereinstermin. Nichts davon erscheint auf der öffentlichen Vereinsseite.</p>
      </fieldset>

      <fieldset className="flex flex-col gap-1 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Auswahl (gilt nur bei „Auswahl“)</legend>
        <p className="text-xs text-muted-foreground">Rollen:</p>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {Object.entries(ROLLEN).map(([schluessel, r]) => (
            <label key={schluessel} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="rollen" value={schluessel} defaultChecked={werte?.rollen.includes(schluessel)} className="size-4 accent-primary" />
              {r.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Einzelne Personen zusätzlich:</p>
        <div className="max-h-56 overflow-y-auto rounded-md border p-2">
          {personen.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Personen angelegt.</p>
          ) : (
            personen.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name="personen" value={p.id} defaultChecked={werte?.personen.includes(p.id)} className="size-4 accent-primary" />
                {p.label}
              </label>
            ))
          )}
        </div>
      </fieldset>

      {werte?.serieId && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="folgende" className="size-4 accent-primary" />
          Auch alle folgenden Termine der Serie ändern
          {werte.wiederholung && istWiederholung(werte.wiederholung) ? ` (${serienText(werte.wiederholung, werte.start)})` : ""} — sie behalten ihren Tag und übernehmen Uhrzeit, Ort, Titel und Sichtbarkeit
        </label>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="antwortAbfrage" defaultChecked={werte?.antwortAbfrage ?? true} className="size-4 accent-primary" />
        Um Rückmeldung bitten (Zusage / Vielleicht / Absage)
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="benachrichtigen" defaultChecked className="size-4 accent-primary" />
        {informierenText}
      </label>
      <SubmitButton className="w-full sm:w-auto sm:self-start">{absenden}</SubmitButton>
    </form>
  );
}
