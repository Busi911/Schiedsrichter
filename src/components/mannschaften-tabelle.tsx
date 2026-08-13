"use client";

import { useMemo, useState } from "react";
import {
  deleteMannschaften,
  updateMannschaft,
  deleteMannschaft,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
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
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [mehrfachauswahl, setMehrfachauswahl] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.altersklasse ?? "").toLowerCase().includes(q)
    );
  }, [liste, suche]);

  const alleSichtbarenAusgewaehlt =
    gefiltert.length > 0 && gefiltert.every((m) => ausgewaehlt.has(m.id));

  function toggleEins(id: string) {
    setAusgewaehlt((bisherige) => {
      const naechste = new Set(bisherige);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  function toggleAlleSichtbaren() {
    setAusgewaehlt((bisherige) => {
      if (alleSichtbarenAusgewaehlt) {
        const naechste = new Set(bisherige);
        for (const m of gefiltert) naechste.delete(m.id);
        return naechste;
      }
      return new Set([...bisherige, ...gefiltert.map((m) => m.id)]);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche nach Name oder Altersklasse…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="max-w-xs"
        />
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
          <form action={deleteMannschaften} className="flex items-center gap-2">
            {[...ausgewaehlt].map((id) => (
              <input key={id} type="hidden" name="mannschaftId" value={id} />
            ))}
            <ConfirmSubmitButton
              confirmText={`${ausgewaehlt.size} Mannschaft${ausgewaehlt.size === 1 ? "" : "en"} wirklich löschen?`}
              variant="destructive"
              size="sm"
            >
              {ausgewaehlt.size} Mannschaft{ausgewaehlt.size === 1 ? "" : "en"}{" "}
              löschen
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {liste.length === 0 ? "Noch keine Mannschaften angelegt." : "Keine Treffer."}
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
              <TableHead>Altersklasse</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((m) => (
              <TableRow key={m.id}>
                {mehrfachauswahl && (
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`${m.name} auswählen`}
                      checked={ausgewaehlt.has(m.id)}
                      onChange={() => toggleEins(m.id)}
                    />
                  </TableCell>
                )}
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
