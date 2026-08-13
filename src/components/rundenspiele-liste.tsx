"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

type Rundenspiel = {
  id: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  mannschaftName: string | null;
  heimMannschaftName: string | null;
  auswaertsMannschaftName: string | null;
  kategorie: string | null;
};

// Client-seitige Suche (Datensatz pro Verein/Saison klein genug, kein
// Server-Roundtrip nötig) — die Liste wächst durch den automatischen
// nuLiga-Import stetig und enthält auch fremde Mannschaften an der eigenen
// Halle, daher hier eher relevant als bei manuell gepflegten Listen.
export function RundenspieleListe({ liste }: { liste: Rundenspiel[] }) {
  const [suche, setSuche] = useState("");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter((t) =>
      [
        t.beschreibung,
        t.ort,
        t.mannschaftName,
        t.heimMannschaftName,
        t.auswaertsMannschaftName,
        t.kategorie,
      ]
        .filter(Boolean)
        .some((feld) => feld!.toLowerCase().includes(q))
    );
  }, [liste, suche]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Suche nach Mannschaft, Ort oder Beschreibung…"
        value={suche}
        onChange={(e) => setSuche(e.target.value)}
        className="max-w-xs"
      />
      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {liste.length === 0 ? "Noch keine Spiele importiert." : "Keine Treffer."}
        </p>
      ) : (
        <div className="flex flex-col divide-y">
          {gefiltert.map((t) => (
            <div key={t.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium">
                  {formatDateTime(t.start)}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t.ort ?? "—"}
                </span>
              </div>
              <p className="text-sm">{t.beschreibung ?? "—"}</p>
              {t.mannschaftName && (
                <p className="text-xs text-muted-foreground">
                  Eigene Mannschaft: {t.mannschaftName}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
