"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SCHRITT = 10;

export type NaechsterTerminZeile = {
  id: string;
  zeit: string;
  typLabel: string;
  ort: string | null;
};

// Zeigt anfangs nur SCHRITT Zeilen — bei vielen Terminen/offenen Diensten
// (z.B. über eine ganze Saison) sonst unübersichtlich lange Tabellen auf der
// Übersicht. "Mehr laden" blendet clientseitig weitere SCHRITT Zeilen aus den
// bereits geladenen Daten ein, statt für jede Erweiterung neu vom Server zu
// laden.
export function NaechsteTermineTabelle({
  termine,
}: {
  termine: NaechsterTerminZeile[];
}) {
  const [sichtbar, setSichtbar] = useState(SCHRITT);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Termin</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Ort</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {termine.slice(0, sichtbar).map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.zeit}</TableCell>
              <TableCell>
                <Badge variant="secondary">{t.typLabel}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.ort ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sichtbar < termine.length && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          onClick={() => setSichtbar((n) => n + SCHRITT)}
        >
          Mehr laden ({termine.length - sichtbar} weitere)
        </Button>
      )}
    </>
  );
}

export type OffenerPostenZeile = {
  terminId: string;
  zeit: string;
  luecken: { rolle: string; vorhanden: number; bedarf: number }[];
};

export function UnbesetzteDiensteTabelle({
  posten,
}: {
  posten: OffenerPostenZeile[];
}) {
  const [sichtbar, setSichtbar] = useState(SCHRITT);
  const sichtbarePosten = posten.slice(0, sichtbar);

  return (
    <>
      <Table>
        <TableBody>
          {sichtbarePosten.flatMap((p) =>
            p.luecken.map((l, i) => (
              <TableRow key={`${p.terminId}-${l.rolle}`}>
                {i === 0 && (
                  <TableCell
                    rowSpan={p.luecken.length}
                    className="w-0 align-top text-sm font-medium whitespace-normal"
                  >
                    {p.zeit}
                  </TableCell>
                )}
                <TableCell className="text-sm whitespace-normal text-muted-foreground">
                  {l.rolle}: {l.vorhanden}/{l.bedarf}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {sichtbar < posten.length && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          onClick={() => setSichtbar((n) => n + SCHRITT)}
        >
          Mehr laden ({posten.length - sichtbar} weitere)
        </Button>
      )}
    </>
  );
}
