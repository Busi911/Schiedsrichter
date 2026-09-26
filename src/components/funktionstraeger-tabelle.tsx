"use client";

import { useMemo, useState } from "react";
import {
  deleteFunktionstraeger,
  funktionstraegerRollenAktivieren,
  rollenHinzufuegenMehrfach,
} from "@/app/admin/(dashboard)/actions";
import { FunktionstraegerBearbeitenDialog } from "@/components/funktionstraeger-bearbeiten-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DisclosureSummary } from "@/components/disclosure-summary";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatumZeit } from "@/lib/format";
import { TYP_LABEL } from "@/lib/funktionstraeger-typ-label";

const SELECT_KLASSE =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export type Rolle = {
  rolleId: string;
  typ: string;
  aktiv: boolean;
  mannschaftName: string | null;
  lizenzGueltigBis: Date | null;
};
export type Person = {
  userId: string;
  name: string | null;
  email: string;
  istAdmin: boolean;
  istAdminLesend: boolean;
  letzterLoginAm: Date | null;
  rollen: Rolle[];
};

// Übersicht ohne direkt sichtbare Edit-Formulare (bei vielen Funktionsträgern
// wurde die Liste sonst unübersichtlich) — Bearbeiten pro Zeile über natives
// <details> ein-/ausklappbar, plus Client-seitige Filter (Suche/Rolle/Status;
// Datensatz pro Verein klein genug, kein Server-Roundtrip nötig).
export function FunktionstraegerTabelle({
  personen,
  eigeneUserId,
  mannschaftsListe = [],
  schreibzugriff = true,
  // Von der "Neue Selbstregistrierung"-Mail vorbelegt (siehe
  // admin/funktionstraeger/page.tsx) — zeigt direkt nur die neu
  // registrierte Person, statt sie in der Gesamtliste suchen zu müssen.
  initialSuche,
}: {
  personen: Person[];
  eigeneUserId: string;
  mannschaftsListe?: { id: string; name: string; altersklasse?: string | null }[];
  schreibzugriff?: boolean;
  initialSuche?: string;
}) {
  const [suche, setSuche] = useState(initialSuche ?? "");
  const [rolleFilter, setRolleFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState<"alle" | "aktiv" | "inaktiv">(
    "alle"
  );
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [mehrfachauswahl, setMehrfachauswahl] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return personen.filter((p) => {
      if (
        q &&
        !(p.name ?? "").toLowerCase().includes(q) &&
        !p.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      // Ohne aktiven Rollen-/Status-Filter auch Personen zeigen, die NUR
      // Admin sind (kein eigener Funktionsträger-Typ, also leeres rollen[])
      // — sonst würden sie durch die .some()-Prüfung unten unsichtbar.
      if (rolleFilter === "alle" && statusFilter === "alle") return true;
      return p.rollen.some((r) => {
        if (rolleFilter !== "alle" && r.typ !== rolleFilter) return false;
        if (statusFilter === "aktiv" && !r.aktiv) return false;
        if (statusFilter === "inaktiv" && r.aktiv) return false;
        return true;
      });
    });
  }, [personen, suche, rolleFilter, statusFilter]);

  // Vorbelegte Suche über die Mail-Verlinkung UND genau ein Treffer — dann
  // gleich das Bearbeiten-Panel aufklappen, sonst müsste der Wart nach dem
  // ohnehin schon gezielten Sucheinstieg trotzdem noch selbst klicken.
  const automatischAufgeklappt = !!initialSuche && gefiltert.length === 1;

  // Man selbst darf nicht in der Mehrfachauswahl landen (keine
  // Selbstlöschung über diesen Weg, siehe deleteFunktionstraeger).
  const auswaehlbar = useMemo(
    () => gefiltert.filter((p) => p.userId !== eigeneUserId),
    [gefiltert, eigeneUserId]
  );
  const alleSichtbarenAusgewaehlt =
    auswaehlbar.length > 0 && auswaehlbar.every((p) => ausgewaehlt.has(p.userId));

  function toggleEins(userId: string) {
    setAusgewaehlt((bisherige) => {
      const naechste = new Set(bisherige);
      if (naechste.has(userId)) naechste.delete(userId);
      else naechste.add(userId);
      return naechste;
    });
  }

  function toggleAlleSichtbaren() {
    setAusgewaehlt((bisherige) => {
      if (alleSichtbarenAusgewaehlt) {
        const naechste = new Set(bisherige);
        for (const p of auswaehlbar) naechste.delete(p.userId);
        return naechste;
      }
      return new Set([...bisherige, ...auswaehlbar.map((p) => p.userId)]);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche nach Name oder E-Mail…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={rolleFilter}
          onChange={(e) => setRolleFilter(e.target.value)}
          className={SELECT_KLASSE}
        >
          <option value="alle">Alle Rollen</option>
          {Object.entries(TYP_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "alle" | "aktiv" | "inaktiv")
          }
          className={SELECT_KLASSE}
        >
          <option value="alle">Alle Status</option>
          <option value="aktiv">Nur aktive Rollen</option>
          <option value="inaktiv">Nur inaktive Rollen</option>
        </select>
        {schreibzugriff && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setMehrfachauswahl((an) => !an);
              setAusgewaehlt(new Set());
            }}
          >
            {mehrfachauswahl ? "Mehrfachauswahl beenden" : "Mehrfachauswahl"}
          </Button>
        )}
        {mehrfachauswahl && ausgewaehlt.size > 0 && (
          <>
            <form
              action={funktionstraegerRollenAktivieren}
              className="flex items-center gap-2"
            >
              {[...ausgewaehlt].map((id) => (
                <input key={id} type="hidden" name="userId" value={id} />
              ))}
              <SubmitButton variant="outline" size="sm">
                Rollen aktivieren ({ausgewaehlt.size})
              </SubmitButton>
            </form>
            <details className="text-left">
              <DisclosureSummary>
                Rollen hinzufügen ({ausgewaehlt.size})…
              </DisclosureSummary>
              <form
                action={rollenHinzufuegenMehrfach}
                className="mt-2 flex flex-col gap-2 rounded-lg border bg-background p-3"
              >
                {[...ausgewaehlt].map((id) => (
                  <input key={id} type="hidden" name="userId" value={id} />
                ))}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {Object.entries(TYP_LABEL).map(([value, label]) => (
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
                  <SubmitButton variant="outline" size="sm">
                    Ausgewählte Rollen für {ausgewaehlt.size} Person
                    {ausgewaehlt.size === 1 ? "" : "en"} hinzufügen
                  </SubmitButton>
                </div>
              </form>
            </details>
            <form
              action={deleteFunktionstraeger}
              className="flex items-center gap-2"
            >
              {[...ausgewaehlt].map((id) => (
                <input key={id} type="hidden" name="userId" value={id} />
              ))}
              <ConfirmSubmitButton
                confirmText={`${ausgewaehlt.size} Person${ausgewaehlt.size === 1 ? "" : "en"} wirklich löschen? Login, Rollen und die komplette Einsatz-Historie gehen dabei unwiderruflich verloren.`}
                variant="destructive"
                size="sm"
              >
                {ausgewaehlt.size} Person{ausgewaehlt.size === 1 ? "" : "en"} löschen
              </ConfirmSubmitButton>
            </form>
          </>
        )}
      </div>

      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {personen.length === 0
            ? "Noch keine Funktionsträger angelegt."
            : "Keine Treffer."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {mehrfachauswahl && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Alle sichtbaren auswählen"
                    checked={alleSichtbarenAusgewaehlt}
                    onChange={toggleAlleSichtbaren}
                  />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Rollen</TableHead>
              <TableHead>Zuletzt eingeloggt</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((p) => (
              <TableRow key={p.userId}>
                {mehrfachauswahl && (
                  <TableCell>
                    {p.userId !== eigeneUserId && (
                      <input
                        type="checkbox"
                        aria-label={`${p.name ?? p.email} auswählen`}
                        checked={ausgewaehlt.has(p.userId)}
                        onChange={() => toggleEins(p.userId)}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {p.istAdmin && <Badge variant="default">Admin</Badge>}
                    {p.istAdminLesend && (
                      <Badge variant="outline">Admin (nur lesend)</Badge>
                    )}
                    {p.rollen.map((r) => (
                      <Badge
                        key={r.rolleId}
                        variant={r.aktiv ? "secondary" : "outline"}
                      >
                        {TYP_LABEL[r.typ] ?? r.typ}
                        {r.mannschaftName ? ` (${r.mannschaftName})` : ""}
                        {!r.aktiv && " · inaktiv"}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.letzterLoginAm ? formatDatumZeit(p.letzterLoginAm) : "Nie"}
                </TableCell>
                <TableCell className="text-right">
                  {schreibzugriff && (
                    <FunktionstraegerBearbeitenDialog
                      person={p}
                      eigeneUserId={eigeneUserId}
                      mannschaftsListe={mannschaftsListe}
                      automatischOeffnen={automatischAufgeklappt}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
