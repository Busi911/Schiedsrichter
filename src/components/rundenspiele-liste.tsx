"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { formatErgebnis } from "@/lib/termin-label";

type Rundenspiel = {
  id: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  mannschaftName: string | null;
  heimMannschaftName: string | null;
  auswaertsMannschaftName: string | null;
  kategorie: string | null;
  ergebnisHeim: number | null;
  ergebnisAuswaerts: number | null;
};

// Client-seitige Suche (Datensatz pro Verein/Saison klein genug, kein
// Server-Roundtrip nötig) — die Liste wächst durch den automatischen
// nuLiga-Import stetig und enthält auch fremde Mannschaften an der eigenen
// Halle, daher hier eher relevant als bei manuell gepflegten Listen.
// Zusätzlich Anstehend/Vergangen-Umschalter aus demselben Grund wie in
// testspiele-liste.tsx: vergangene Spiele sortierten sich sonst (aufsteigend
// nach Datum) ganz nach oben und verdrängten die tatsächlich noch
// anstehenden. Ergebnisse kommen automatisch aus dem nuLiga-Sync (siehe
// rundenspiel-sync.ts) und sind hier bewusst nur angezeigt, nicht editierbar
// — eine manuelle Eingabe würde beim nächsten Sync ohnehin überschrieben.
export function RundenspieleListe({ liste }: { liste: Rundenspiel[] }) {
  const [suche, setSuche] = useState("");
  const [jetzt] = useState(() => new Date());
  const [zeitraum, setZeitraum] = useState<"anstehend" | "vergangen">("anstehend");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const nachZeitraum = liste.filter((t) =>
      zeitraum === "anstehend" ? t.start >= jetzt : t.start < jetzt
    );
    const nachSuche = q
      ? nachZeitraum.filter((t) =>
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
        )
      : nachZeitraum;
    return zeitraum === "anstehend"
      ? [...nachSuche].sort((a, b) => a.start.getTime() - b.start.getTime())
      : [...nachSuche].sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [liste, suche, zeitraum, jetzt]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border bg-muted p-1 text-xs">
          <button
            type="button"
            onClick={() => setZeitraum("anstehend")}
            className={cn(
              buttonVariants({
                variant: zeitraum === "anstehend" ? "secondary" : "ghost",
                size: "xs",
              }),
              zeitraum === "anstehend" && "shadow-sm"
            )}
          >
            Anstehend
          </button>
          <button
            type="button"
            onClick={() => setZeitraum("vergangen")}
            className={cn(
              buttonVariants({
                variant: zeitraum === "vergangen" ? "secondary" : "ghost",
                size: "xs",
              }),
              zeitraum === "vergangen" && "shadow-sm"
            )}
          >
            Vergangene Spiele
          </button>
        </div>
        <Input
          placeholder="Suche nach Mannschaft, Ort oder Beschreibung…"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          className="max-w-xs"
        />
      </div>
      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {liste.length === 0
            ? "Noch keine Spiele importiert."
            : zeitraum === "anstehend" && !suche
              ? "Keine anstehenden Spiele."
              : "Keine Treffer."}
        </p>
      ) : (
        <div className="flex flex-col divide-y">
          {gefiltert.map((t) => {
            const ergebnis = formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts);
            return (
              <div key={t.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium">
                    {formatDateTime(t.start)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.ort ?? "—"}
                  </span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm">{t.beschreibung ?? "—"}</p>
                  {ergebnis && (
                    <span className="text-sm font-medium">{ergebnis}</span>
                  )}
                </div>
                {t.mannschaftName && (
                  <p className="text-xs text-muted-foreground">
                    Eigene Mannschaft: {t.mannschaftName}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
