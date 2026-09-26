"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

// Gleiches Tabellen-Layout wie testspiele-liste.tsx (Datum/Mannschaft/Ort/
// Beschreibung/Ergebnis-Spalten) statt einer abweichenden Kartenliste —
// beide Tabs auf /admin/termine sollen sich gleich bedienen lassen. Kein
// "Typ"/"Bearbeiten" wie dort: Rundenspiele sind alle vom selben Typ und
// werden ausschließlich per nuLiga-/handball.net-Sync gepflegt, nicht
// manuell bearbeitet.
//
// Client-seitige Suche (Datensatz pro Verein/Saison klein genug, kein
// Server-Roundtrip nötig) — die Liste wächst durch den automatischen
// Sync stetig und enthält auch fremde Mannschaften an der eigenen Halle,
// daher hier eher relevant als bei manuell gepflegten Listen. Zusätzlich
// Anstehend/Vergangen-Umschalter aus demselben Grund wie in
// testspiele-liste.tsx: vergangene Spiele sortierten sich sonst
// (aufsteigend nach Datum) ganz nach oben und verdrängten die
// tatsächlich noch anstehenden. Ergebnisse kommen automatisch aus dem
// Sync (siehe rundenspiel-sync.ts) und sind hier bewusst nur angezeigt,
// nicht editierbar — eine manuelle Eingabe würde beim nächsten Sync
// ohnehin überschrieben.
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Mannschaft</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Ergebnis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {formatDateTime(t.start)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.mannschaftName ?? "—"}
                </TableCell>
                <TableCell>{t.ort ?? "—"}</TableCell>
                <TableCell>{t.beschreibung ?? "—"}</TableCell>
                <TableCell>
                  {formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts) ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
