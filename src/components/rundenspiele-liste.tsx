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
import {
  formatDatumZeit as formatDateTime,
  formatWochentagDatum,
  formatZeit,
  gruppiereNachTag,
} from "@/lib/format";
import { formatErgebnis } from "@/lib/termin-label";
import { eindeutigeWerte, filtereNachAnsicht, type Ansicht } from "@/lib/rundenspiel-filter";

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
  /** Ort passt zu einer eigenen Spielhalle (true), zu einer fremden (false), nicht entscheidbar (null, z.B. keine Hallen eingetragen). */
  eigeneHalle: boolean | null;
};

const SELECT_KLASSE = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

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
  const [zeitraum, setZeitraum] = useState<"anstehend" | "vergangen">(
    "anstehend",
  );
  const [ansicht, setAnsicht] = useState<Ansicht>("alle");
  const [mannschaft, setMannschaft] = useState("");
  const [halle, setHalle] = useState("");
  const kannTrennen = liste.some((t) => t.eigeneHalle !== null);
  const mannschaftsOptionen = useMemo(() => eindeutigeWerte(liste.map((t) => t.mannschaftName)), [liste]);
  const hallenOptionen = useMemo(() => eindeutigeWerte(liste.map((t) => t.ort)), [liste]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const nachZeitraum = filtereNachAnsicht(liste, { ansicht, mannschaft, halle }).filter((t) =>
      zeitraum === "anstehend" ? t.start >= jetzt : t.start < jetzt,
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
            .some((feld) => feld!.toLowerCase().includes(q)),
        )
      : nachZeitraum;
    return zeitraum === "anstehend"
      ? [...nachSuche].sort((a, b) => a.start.getTime() - b.start.getTime())
      : [...nachSuche].sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [liste, suche, zeitraum, jetzt, ansicht, mannschaft, halle]);

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
              zeitraum === "anstehend" && "shadow-sm",
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
              zeitraum === "vergangen" && "shadow-sm",
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
      <div className="flex flex-wrap items-center gap-2">
        {kannTrennen ? (
          <div role="group" aria-label="Ansicht" className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1 text-xs">
            {(
              [
                ["alle", "Alle Vereinsspiele"],
                ["eigene", "Eigene Hallen (Heim)"],
                ["auswaerts", "Auswärts / fremde Halle"],
              ] as const
            ).map(([wert, label]) => (
              <button
                key={wert}
                type="button"
                aria-pressed={ansicht === wert}
                onClick={() => setAnsicht(wert)}
                className={cn(buttonVariants({ variant: ansicht === wert ? "secondary" : "ghost", size: "xs" }), ansicht === wert && "shadow-sm")}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Heim und Auswärts lassen sich trennen, sobald unter Einstellungen → Spielhallen eure Hallen eingetragen sind.
          </p>
        )}
        <select aria-label="Nach Mannschaft filtern" value={mannschaft} onChange={(e) => setMannschaft(e.target.value)} className={SELECT_KLASSE}>
          <option value="">Alle Mannschaften</option>
          {mannschaftsOptionen.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Nach Halle filtern" value={halle} onChange={(e) => setHalle(e.target.value)} className={SELECT_KLASSE}>
          <option value="">Alle Hallen</option>
          {hallenOptionen.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
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
        <>
          <div className="flex flex-col gap-4 md:hidden">
            {gruppiereNachTag(gefiltert).map((g) => (
              <section key={g.tag} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {formatWochentagDatum(g.start)}
                </h3>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {g.eintraege.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-col gap-0.5 p-3 text-sm"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {formatZeit(t.start)} Uhr
                        </span>
                        {formatErgebnis(
                          t.ergebnisHeim,
                          t.ergebnisAuswaerts,
                        ) && (
                          <span className="font-medium">
                            {formatErgebnis(
                              t.ergebnisHeim,
                              t.ergebnisAuswaerts,
                            )}
                          </span>
                        )}
                      </div>
                      {t.beschreibung && <span>{t.beschreibung}</span>}
                      <span className="text-xs text-muted-foreground">
                        {[t.mannschaftName, t.ort, t.eigeneHalle === true ? "eigene Halle" : t.eigeneHalle === false ? "Auswärts" : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Mannschaft</TableHead>
                  <TableHead>Ort</TableHead>
                  <TableHead>Heim/Auswärts</TableHead>
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
                    <TableCell className="text-muted-foreground">
                      {t.eigeneHalle === true ? "Eigene Halle" : t.eigeneHalle === false ? "Auswärts" : "—"}
                    </TableCell>
                    <TableCell>{t.beschreibung ?? "—"}</TableCell>
                    <TableCell>
                      {formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts) ??
                        "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
