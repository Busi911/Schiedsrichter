"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateTestspielErgebnis } from "@/app/admin/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatMannschaft } from "@/lib/mannschaft-label";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { formatErgebnis } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
};

type Termin = {
  id: string;
  typ: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  mannschaftName: string | null;
  mannschaftAltersklasse: string | null;
  kategorie: string | null;
  ergebnisHeim: number | null;
  ergebnisAuswaerts: number | null;
};

// Zwei Reiter (Anstehend/Vergangen) statt einer einzigen, unbegrenzt
// wachsenden Liste — vergangene Termine sortierten sich sonst (aufsteigend
// nach Datum) ganz nach oben und verdrängten optisch die tatsächlich noch
// zu planenden Termine. Client-seitig wie in rundenspiele-liste.tsx
// (Datensatz pro Verein/Saison klein genug, kein Server-Roundtrip nötig).
// "jetzt" einmalig beim Mount eingefroren (useState-Lazy-Initializer statt
// Date.now() direkt im Render), damit der Vergleich über die Lebensdauer
// der Seite stabil bleibt statt bei jedem Re-Render leicht zu verschieben.
export function TestspieleListe({
  liste,
  istAdmin,
}: {
  liste: Termin[];
  istAdmin: boolean;
}) {
  const [jetzt] = useState(() => new Date());
  const [zeitraum, setZeitraum] = useState<"anstehend" | "vergangen">("anstehend");

  const gefiltert = useMemo(() => {
    const gefilterteListe = liste.filter((t) =>
      zeitraum === "anstehend" ? t.start >= jetzt : t.start < jetzt
    );
    return zeitraum === "anstehend"
      ? gefilterteListe.sort((a, b) => a.start.getTime() - b.start.getTime())
      : gefilterteListe.sort((a, b) => b.start.getTime() - a.start.getTime());
  }, [liste, zeitraum, jetzt]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-fit gap-1 rounded-lg border bg-muted p-1 text-xs">
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

      {gefiltert.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {zeitraum === "anstehend"
            ? "Keine anstehenden Termine."
            : "Noch keine vergangenen Termine."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Mannschaft</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Ergebnis</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gefiltert.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  {formatDateTime(t.start)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{TYP_LABEL[t.typ] ?? t.typ}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatMannschaft(t) ?? "—"}
                </TableCell>
                <TableCell>{t.ort ?? "—"}</TableCell>
                <TableCell>{t.beschreibung ?? "—"}</TableCell>
                <TableCell>
                  {t.typ === "testspiel" && istAdmin ? (
                    <form
                      action={updateTestspielErgebnis}
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="terminId" value={t.id} />
                      <Input
                        name="ergebnisHeim"
                        type="number"
                        min={0}
                        defaultValue={t.ergebnisHeim ?? ""}
                        placeholder="—"
                        className="h-7 w-14"
                      />
                      <span className="text-muted-foreground">:</span>
                      <Input
                        name="ergebnisAuswaerts"
                        type="number"
                        min={0}
                        defaultValue={t.ergebnisAuswaerts ?? ""}
                        placeholder="—"
                        className="h-7 w-14"
                      />
                      <SubmitButton variant="ghost" size="xs">
                        Speichern
                      </SubmitButton>
                    </form>
                  ) : (
                    (formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts) ?? "—")
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/termine/${t.id}`}
                    className="text-xs text-muted-foreground underline"
                  >
                    Bearbeiten
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
