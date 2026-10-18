import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GESCHLECHTER, STATI } from "@/lib/mitglieder";

const SELECT_KLASSE =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export type MitgliedWerte = {
  id: string;
  name: string;
  vorname: string;
  geburtsdatum: string | null;
  email: string | null;
  telefon: string | null;
  geschlecht: string | null;
  artId: string | null;
  status: string;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
  bemerkung: string | null;
};

// Anlegen und Bearbeiten eines Mitglieds (gleiche Felder). `idPraefix` hält die Feld-IDs je Formular auf der Seite eindeutig.
export function MitgliedFormular({
  action,
  werte,
  arten = [],
  absenden,
  idPraefix,
}: {
  action: (formData: FormData) => Promise<void>;
  werte?: MitgliedWerte;
  arten?: { id: string; name: string }[];
  absenden: string;
  idPraefix: string;
}) {
  const f = (n: string) => `${idPraefix}-${n}`;
  return (
    <form action={action} className="flex flex-col gap-3">
      {werte && <input type="hidden" name="id" value={werte.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("vorname")}>Vorname</Label>
          <Input id={f("vorname")} name="vorname" required maxLength={100} defaultValue={werte?.vorname ?? ""} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("name")}>Nachname</Label>
          <Input id={f("name")} name="name" required maxLength={100} defaultValue={werte?.name ?? ""} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("geburtsdatum")}>Geburtsdatum</Label>
          <Input id={f("geburtsdatum")} name="geburtsdatum" type="date" defaultValue={werte?.geburtsdatum ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("geschlecht")}>Geschlecht</Label>
          <select id={f("geschlecht")} name="geschlecht" defaultValue={werte?.geschlecht ?? ""} className={SELECT_KLASSE}>
            <option value="">Keine Angabe</option>
            {Object.entries(GESCHLECHTER).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("email")}>E-Mail</Label>
          <Input id={f("email")} name="email" type="email" defaultValue={werte?.email ?? ""} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("telefon")}>Telefon</Label>
          <Input id={f("telefon")} name="telefon" type="tel" maxLength={50} defaultValue={werte?.telefon ?? ""} autoComplete="off" />
        </div>
        {arten.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f("artId")}>Art der Mitgliedschaft</Label>
            <select id={f("artId")} name="artId" defaultValue={werte?.artId ?? ""} className={SELECT_KLASSE}>
              <option value="">Keine Angabe</option>
              {arten.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("status")}>Status</Label>
          <select id={f("status")} name="status" defaultValue={werte?.status ?? "aktiv"} className={SELECT_KLASSE}>
            {Object.entries(STATI).map(([wert, label]) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("eintrittsdatum")}>Eintritt</Label>
          <Input id={f("eintrittsdatum")} name="eintrittsdatum" type="date" defaultValue={werte?.eintrittsdatum ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={f("austrittsdatum")}>Austritt (nur bei „Ausgetreten“, leer = heute)</Label>
          <Input id={f("austrittsdatum")} name="austrittsdatum" type="date" defaultValue={werte?.austrittsdatum ?? ""} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={f("bemerkung")}>Bemerkung (nur für die Verwaltung)</Label>
        <Textarea id={f("bemerkung")} name="bemerkung" rows={2} maxLength={2000} defaultValue={werte?.bemerkung ?? ""} />
      </div>
      {!werte && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="trotzdem" className="mt-1 size-4" />
          <span>
            Trotzdem neu anlegen, falls es schon ein Mitglied mit gleichem Namen oder gleicher E-Mail gibt (eine andere Person).
          </span>
        </label>
      )}
      <SubmitButton className="w-full sm:w-auto" pendingText="Speichert…">
        {absenden}
      </SubmitButton>
    </form>
  );
}
