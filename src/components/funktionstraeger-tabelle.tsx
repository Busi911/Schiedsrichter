"use client";

import { useMemo, useState } from "react";
import {
  adminLesendRechteToggeln,
  adminRechteToggeln,
  deleteFunktionstraeger,
  funktionstraegerAktivToggeln,
  rolleHinzufuegen,
  updateFunktionstraeger,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
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
import { cn } from "@/lib/utils";

// Siehe DISCLOSURE_KLASSE in profil/schiedsrichterwart/page.tsx.
const DISCLOSURE_KLASSE = cn(
  buttonVariants({ variant: "outline", size: "xs" }),
  "cursor-pointer list-none [&::-webkit-details-marker]:hidden"
);

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienstwart",
};

const SELECT_KLASSE =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Rolle = {
  rolleId: string;
  typ: string;
  aktiv: boolean;
  mannschaftName: string | null;
};
type Person = {
  userId: string;
  name: string | null;
  email: string;
  istAdmin: boolean;
  istAdminLesend: boolean;
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
}: {
  personen: Person[];
  eigeneUserId: string;
  mannschaftsListe?: { id: string; name: string; altersklasse?: string | null }[];
}) {
  const [suche, setSuche] = useState("");
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
        {mehrfachauswahl && ausgewaehlt.size > 0 && (
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
                <TableCell className="text-right">
                  <details className="text-left">
                    <summary className={DISCLOSURE_KLASSE}>Bearbeiten</summary>
                    <div className="mt-2 flex flex-col gap-3 rounded-lg border p-3">
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
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                        >
                          Speichern
                        </Button>
                      </form>
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
                            <span className="text-muted-foreground">
                              (du selbst)
                            </span>
                          ) : (
                            <form action={adminRechteToggeln}>
                              <input
                                type="hidden"
                                name="userId"
                                value={p.userId}
                              />
                              <Button type="submit" variant="ghost" size="xs">
                                {p.istAdmin
                                  ? "Admin-Rechte entziehen"
                                  : "Zum Admin machen"}
                              </Button>
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
                            {p.istAdminLesend
                              ? "Admin (nur lesend)"
                              : "Kein Admin (nur lesend)"}
                          </span>
                          {p.userId === eigeneUserId ? (
                            <span className="text-muted-foreground">
                              (du selbst)
                            </span>
                          ) : (
                            <form action={adminLesendRechteToggeln}>
                              <input
                                type="hidden"
                                name="userId"
                                value={p.userId}
                              />
                              <Button type="submit" variant="ghost" size="xs">
                                {p.istAdminLesend
                                  ? "Lesezugriff entziehen"
                                  : "Lesezugriff geben"}
                              </Button>
                            </form>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.rollen.map((r) => (
                          <span
                            key={r.rolleId}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
                              r.aktiv
                                ? "border-border"
                                : "border-destructive/30 text-destructive"
                            }`}
                          >
                            <span className="font-medium">
                              {TYP_LABEL[r.typ] ?? r.typ}
                              {r.mannschaftName ? ` (${r.mannschaftName})` : ""}
                              {!r.aktiv && " · inaktiv"}
                            </span>
                            <form action={funktionstraegerAktivToggeln}>
                              <input
                                type="hidden"
                                name="rolleId"
                                value={r.rolleId}
                              />
                              <Button type="submit" variant="ghost" size="xs">
                                {r.aktiv ? "Deaktivieren" : "Aktivieren"}
                              </Button>
                            </form>
                          </span>
                        ))}
                      </div>
                      {(() => {
                        const vorhandeneTypen = new Set(p.rollen.map((r) => r.typ));
                        const verfuegbareRollen = Object.entries(TYP_LABEL).filter(
                          ([typ]) => !vorhandeneTypen.has(typ)
                        );
                        if (verfuegbareRollen.length === 0) return null;
                        return (
                          <form
                            action={rolleHinzufuegen}
                            className="flex flex-wrap items-center gap-2 border-t pt-3"
                          >
                            <input type="hidden" name="userId" value={p.userId} />
                            <div className="w-44">
                              <LabeledSelect
                                name="typ"
                                placeholder="Rolle hinzufügen…"
                                options={verfuegbareRollen.map(([value, label]) => ({
                                  value,
                                  label,
                                }))}
                                required
                              />
                            </div>
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
                            <Button type="submit" variant="outline" size="xs">
                              Hinzufügen
                            </Button>
                          </form>
                        );
                      })()}
                      {/* Bisher nur über die Mehrfachauswahl oben löschbar —
                          für den (weit häufigeren) Fall "genau diese eine
                          Person löschen" zusätzlich direkt hier, statt erst
                          umständlich in den Mehrfachauswahl-Modus wechseln
                          und die Zeile dort erneut suchen zu müssen. */}
                      {p.userId !== eigeneUserId && (
                        <form
                          action={deleteFunktionstraeger}
                          className="border-t pt-3"
                        >
                          <input type="hidden" name="userId" value={p.userId} />
                          <ConfirmSubmitButton
                            confirmText={`${p.name ?? p.email} wirklich löschen? Login, Rollen und die komplette Einsatz-Historie gehen dabei unwiderruflich verloren.`}
                            variant="destructive"
                            size="xs"
                          >
                            Person löschen
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </div>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
