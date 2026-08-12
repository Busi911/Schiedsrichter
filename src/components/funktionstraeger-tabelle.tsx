"use client";

import { useMemo, useState } from "react";
import {
  funktionstraegerAktivToggeln,
  updateFunktionstraeger,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  schiedsrichterwart: "Schiedsrichterwart",
};

const SELECT_KLASSE =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Rolle = {
  rolleId: string;
  typ: string;
  aktiv: boolean;
  mannschaftName: string | null;
};
type Person = { userId: string; name: string | null; email: string; rollen: Rolle[] };

// Übersicht ohne direkt sichtbare Edit-Formulare (bei vielen Funktionsträgern
// wurde die Liste sonst unübersichtlich) — Bearbeiten pro Zeile über natives
// <details> ein-/ausklappbar, plus Client-seitige Filter (Suche/Rolle/Status;
// Datensatz pro Verein klein genug, kein Server-Roundtrip nötig).
export function FunktionstraegerTabelle({ personen }: { personen: Person[] }) {
  const [suche, setSuche] = useState("");
  const [rolleFilter, setRolleFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState<"alle" | "aktiv" | "inaktiv">(
    "alle"
  );

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
      return p.rollen.some((r) => {
        if (rolleFilter !== "alle" && r.typ !== rolleFilter) return false;
        if (statusFilter === "aktiv" && !r.aktiv) return false;
        if (statusFilter === "inaktiv" && r.aktiv) return false;
        return true;
      });
    });
  }, [personen, suche, rolleFilter, statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
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
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Rollen</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((p) => (
              <TableRow key={p.userId}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
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
                    <summary className="cursor-pointer list-none text-xs text-muted-foreground underline [&::-webkit-details-marker]:hidden">
                      Bearbeiten
                    </summary>
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
                              <button
                                type="submit"
                                className="text-muted-foreground underline"
                              >
                                {r.aktiv ? "Deaktivieren" : "Aktivieren"}
                              </button>
                            </form>
                          </span>
                        ))}
                      </div>
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
