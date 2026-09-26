"use client";

import {
  adminLesendRechteToggeln,
  adminRechteToggeln,
  deleteFunktionstraeger,
  funktionstraegerAktivToggeln,
  funktionstraegerRollenAktivierenEinzeln,
  rolleHinzufuegen,
  updateFunktionstraeger,
  updateFunktionstraegerLizenz,
} from "@/app/admin/(dashboard)/actions";
import { LIZENZ_ROLLEN } from "@/lib/lizenz-rollen";
import { TYP_LABEL } from "@/lib/funktionstraeger-typ-label";
import type { Person } from "@/components/funktionstraeger-tabelle";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Gliedert das Bearbeiten-Modal (siehe unten) in benannte Abschnitte statt
// eines flachen Stapels von Formularen — bei jetzt sieben verschiedenen
// Anliegen (Stammdaten, zwei Admin-Schalter, Rollen+Lizenz, Person
// löschen) wirkte ein einziger Block zunehmend unübersichtlich.
function PanelAbschnitt({
  titel,
  gefahr,
  children,
}: {
  titel: string;
  gefahr?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border p-2.5 ${gefahr ? "border-destructive/30" : "border-border"}`}
    >
      <p
        className={`mb-2 text-[0.65rem] font-semibold tracking-wide uppercase ${
          gefahr ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {titel}
      </p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

// Vormals ein natives <details> direkt in der Tabellenzeile — bei den
// mittlerweile vier Abschnitten (Stammdaten, Zugriffsrechte, Rollen &
// Lizenz, Gefahrenzone) wirkte das im schmalen Zellenraum der Tabelle
// gequetscht. Jetzt als Modal, analog zu termin-bearbeiten-dialog.tsx —
// nur für die Einzelperson, NICHT für die Mehrfachauswahl (die bleibt eine
// eigene, davon unabhängige Symbolleiste in funktionstraeger-tabelle.tsx,
// ein Modal ergibt für "mehrere Personen gleichzeitig" keinen Sinn).
export function FunktionstraegerBearbeitenDialog({
  person: p,
  eigeneUserId,
  mannschaftsListe,
  automatischOeffnen,
}: {
  person: Person;
  eigeneUserId: string;
  mannschaftsListe: { id: string; name: string; altersklasse?: string | null }[];
  automatischOeffnen?: boolean;
}) {
  return (
    <Dialog defaultOpen={automatischOeffnen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Bearbeiten
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{p.name ?? p.email}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <PanelAbschnitt titel="Stammdaten">
            <form
              action={updateFunktionstraeger}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="userId" value={p.userId} />
              <Input
                name="name"
                defaultValue={p.name ?? ""}
                required
                className="h-8 w-full sm:w-36"
              />
              <Input
                name="email"
                type="email"
                defaultValue={p.email}
                required
                className="h-8 w-full sm:w-48"
              />
              <SubmitButton variant="outline" size="sm" className="w-full sm:w-auto">
                Speichern
              </SubmitButton>
            </form>
          </PanelAbschnitt>

          <PanelAbschnitt titel="Zugriffsrechte">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                  p.istAdmin ? "border-border" : "border-dashed text-muted-foreground"
                }`}
              >
                <span className="font-medium">
                  {p.istAdmin ? "Admin" : "Kein Admin"}
                </span>
                {p.userId === eigeneUserId ? (
                  <span className="text-muted-foreground">(du selbst)</span>
                ) : (
                  <form action={adminRechteToggeln}>
                    <input type="hidden" name="userId" value={p.userId} />
                    <SubmitButton variant="ghost" size="xs">
                      {p.istAdmin ? "Admin-Rechte entziehen" : "Zum Admin machen"}
                    </SubmitButton>
                  </form>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                  p.istAdminLesend
                    ? "border-border"
                    : "border-dashed text-muted-foreground"
                }`}
              >
                <span className="font-medium">
                  {p.istAdminLesend ? "Admin (nur lesend)" : "Kein Admin (nur lesend)"}
                </span>
                {p.userId === eigeneUserId ? (
                  <span className="text-muted-foreground">(du selbst)</span>
                ) : (
                  <form action={adminLesendRechteToggeln}>
                    <input type="hidden" name="userId" value={p.userId} />
                    <SubmitButton variant="ghost" size="xs">
                      {p.istAdminLesend ? "Lesezugriff entziehen" : "Lesezugriff geben"}
                    </SubmitButton>
                  </form>
                )}
              </span>
            </div>
          </PanelAbschnitt>

          <PanelAbschnitt titel="Rollen & Lizenz">
            <div className="flex flex-wrap gap-1.5">
              {p.rollen
                .filter((r) => r.aktiv)
                .map((r) => (
                  <span
                    key={r.rolleId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs"
                  >
                    <span className="font-medium">
                      {TYP_LABEL[r.typ] ?? r.typ}
                      {r.mannschaftName ? ` (${r.mannschaftName})` : ""}
                    </span>
                    <form action={funktionstraegerAktivToggeln}>
                      <input type="hidden" name="rolleId" value={r.rolleId} />
                      <SubmitButton variant="ghost" size="xs">
                        Deaktivieren
                      </SubmitButton>
                    </form>
                  </span>
                ))}
            </div>
            {p.rollen
              .filter(
                (r) => r.aktiv && (LIZENZ_ROLLEN as readonly string[]).includes(r.typ)
              )
              .map((r) => (
                <form
                  key={r.rolleId}
                  action={updateFunktionstraegerLizenz}
                  className="flex items-center gap-2 text-xs"
                >
                  <input type="hidden" name="rolleId" value={r.rolleId} />
                  <Label
                    htmlFor={`lizenz-${r.rolleId}`}
                    className="font-normal text-muted-foreground"
                  >
                    {TYP_LABEL[r.typ] ?? r.typ}-Lizenz gültig bis
                  </Label>
                  <Input
                    id={`lizenz-${r.rolleId}`}
                    name="lizenzGueltigBis"
                    type="date"
                    defaultValue={
                      r.lizenzGueltigBis
                        ? r.lizenzGueltigBis.toISOString().slice(0, 10)
                        : ""
                    }
                    className="h-7 w-36"
                  />
                  <SubmitButton variant="ghost" size="xs">
                    Speichern
                  </SubmitButton>
                </form>
              ))}
            {(() => {
              const inaktiveRollen = p.rollen.filter((r) => !r.aktiv);
              if (inaktiveRollen.length === 0) return null;
              return (
                <form
                  action={funktionstraegerRollenAktivierenEinzeln}
                  className="flex flex-wrap items-center gap-2"
                >
                  {inaktiveRollen.map((r) => (
                    <label
                      key={r.rolleId}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-2.5 py-0.5 text-xs text-destructive"
                    >
                      <input
                        type="checkbox"
                        name="rolleId"
                        value={r.rolleId}
                        className="size-3.5 accent-primary"
                      />
                      {TYP_LABEL[r.typ] ?? r.typ}
                      {r.mannschaftName ? ` (${r.mannschaftName})` : ""} · inaktiv
                    </label>
                  ))}
                  <SubmitButton variant="outline" size="xs">
                    Ausgewählte aktivieren
                  </SubmitButton>
                </form>
              );
            })()}
            {(() => {
              const vorhandeneTypen = new Set(p.rollen.map((r) => r.typ));
              const verfuegbareRollen = Object.entries(TYP_LABEL).filter(
                ([typ]) => !vorhandeneTypen.has(typ)
              );
              if (verfuegbareRollen.length === 0) return null;
              return (
                <form
                  action={rolleHinzufuegen}
                  className="flex flex-col gap-2 border-t pt-2.5"
                >
                  <input type="hidden" name="userId" value={p.userId} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                    {verfuegbareRollen.map(([value, label]) => (
                      <label key={value} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          name="typ"
                          value={value}
                          className="size-3.5 accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {mannschaftsListe.length > 0 && (
                      <div className="w-40">
                        <LabeledSelect
                          name="mannschaftId"
                          placeholder="Mannschaft (nur Trainer)"
                          options={mannschaftsListe.map((m) => ({
                            value: m.id,
                            label: m.altersklasse
                              ? `${m.name} (${m.altersklasse})`
                              : m.name,
                          }))}
                        />
                      </div>
                    )}
                    <SubmitButton variant="outline" size="xs">
                      Ausgewählte Rollen hinzufügen
                    </SubmitButton>
                  </div>
                </form>
              );
            })()}
          </PanelAbschnitt>

          {/* Bisher nur über die Mehrfachauswahl löschbar — für den (weit
              häufigeren) Fall "genau diese eine Person löschen" zusätzlich
              direkt hier, statt erst umständlich in den
              Mehrfachauswahl-Modus wechseln und die Zeile dort erneut
              suchen zu müssen. */}
          {p.userId !== eigeneUserId && (
            <PanelAbschnitt titel="Gefahrenzone" gefahr>
              <form action={deleteFunktionstraeger}>
                <input type="hidden" name="userId" value={p.userId} />
                <ConfirmSubmitButton
                  confirmText={`${p.name ?? p.email} wirklich löschen? Login, Rollen und die komplette Einsatz-Historie gehen dabei unwiderruflich verloren.`}
                  variant="destructive"
                  size="xs"
                >
                  Person löschen
                </ConfirmSubmitButton>
              </form>
            </PanelAbschnitt>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
