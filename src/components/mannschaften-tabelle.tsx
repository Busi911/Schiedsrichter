"use client";

import { useMemo, useState } from "react";
import { updateMannschaft, deleteMannschaft } from "@/app/admin/actions";
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

type Mannschaft = { id: string; name: string; altersklasse: string | null };

// Übersicht ohne direkt sichtbare Edit-Formulare (die machten die Liste bei
// vielen Mannschaften unübersichtlich) — Bearbeiten/Löschen pro Zeile über
// natives <details> ein-/ausklappbar, plus Client-seitige Suche (Datensatz
// pro Verein klein genug, kein Server-Roundtrip nötig).
export function MannschaftenTabelle({ liste }: { liste: Mannschaft[] }) {
  const [suche, setSuche] = useState("");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.altersklasse ?? "").toLowerCase().includes(q)
    );
  }, [liste, suche]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Suche nach Name oder Altersklasse…"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        className="max-w-xs"
      />
      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {liste.length === 0 ? "Noch keine Mannschaften angelegt." : "Keine Treffer."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Altersklasse</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell>{m.altersklasse ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <details className="group text-left">
                    <summary className="cursor-pointer list-none text-xs text-muted-foreground underline [&::-webkit-details-marker]:hidden">
                      Bearbeiten
                    </summary>
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border p-3">
                      <form
                        action={updateMannschaft}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="mannschaftId" value={m.id} />
                        <Input
                          name="name"
                          defaultValue={m.name}
                          required
                          className="h-8 w-40"
                        />
                        <Input
                          name="altersklasse"
                          defaultValue={m.altersklasse ?? ""}
                          placeholder="Altersklasse"
                          className="h-8 w-36"
                        />
                        <Button type="submit" variant="outline" size="sm">
                          Speichern
                        </Button>
                      </form>
                      <form action={deleteMannschaft}>
                        <input type="hidden" name="mannschaftId" value={m.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Löschen
                        </Button>
                      </form>
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
