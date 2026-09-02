"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";
import type { ZeitnehmerPersonEinsatz } from "@/lib/zeitnehmerwart";

// Siehe TYP_LABEL/ROLLE_LABEL in profil/zeitnehmerwart/page.tsx — hier
// bewusst dupliziert statt importiert, da jene Datei eine Server Component
// ist und dieses Modal (useState-freier Client-Trigger) unabhängig davon
// bleiben soll.
const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

function EinsatzZeile({ einsatz }: { einsatz: ZeitnehmerPersonEinsatz }) {
  const typLabel =
    einsatz.typ === "rundenspiel"
      ? rundenspielTypLabel(einsatz.pflichtspiel, einsatz.freundschaftsTyp)
      : (TYP_LABEL[einsatz.typ] ?? einsatz.typ);
  const mannschaftLabel = einsatz.mannschaftName
    ? einsatz.mannschaftAltersklasse
      ? `${einsatz.mannschaftName} (${einsatz.mannschaftAltersklasse})`
      : einsatz.mannschaftName
    : null;
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-medium">
        {formatDateTime(einsatz.start)}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{ROLLE_LABEL[einsatz.rolle] ?? einsatz.rolle}</Badge>
      </TableCell>
      <TableCell>{typLabel}</TableCell>
      <TableCell className="text-muted-foreground">
        {mannschaftLabel ?? einsatz.ort ?? einsatz.beschreibung ?? "—"}
      </TableCell>
    </TableRow>
  );
}

export function ZeitnehmerEinsaetzeDialog({
  person,
  einsaetze,
}: {
  person: { name: string | null; email: string };
  einsaetze: ZeitnehmerPersonEinsatz[];
}) {
  // Anstehend zuerst und aufsteigend (nächster Termin oben), Absolviert
  // danach und absteigend (letzter Einsatz oben) — jeweils die für die
  // Situation relevantere Reihenfolge.
  const anstehend = einsaetze
    .filter((e) => !e.istVergangenheit)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const absolviert = einsaetze.filter((e) => e.istVergangenheit);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="underline underline-offset-2 hover:text-primary"
          />
        }
      >
        {person.name ?? person.email}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person.name ?? person.email}</DialogTitle>
          <DialogDescription>{person.email}</DialogDescription>
        </DialogHeader>

        {anstehend.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Anstehend ({anstehend.length})
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Art</TableHead>
                  <TableHead>Mannschaft / Ort</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anstehend.map((e) => (
                  <EinsatzZeile key={`${e.terminId}-${e.rolle}`} einsatz={e} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            Absolviert ({absolviert.length})
          </h3>
          {absolviert.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine absolvierten Einsätze.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Art</TableHead>
                  <TableHead>Mannschaft / Ort</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {absolviert.map((e) => (
                  <EinsatzZeile key={`${e.terminId}-${e.rolle}`} einsatz={e} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
