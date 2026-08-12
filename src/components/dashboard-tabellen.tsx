import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type NaechsterTerminZeile = {
  id: string;
  zeit: string;
  typLabel: string;
  ort: string | null;
  mannschaft: string | null;
};

// Zeigt die vom Aufrufer übergebenen Zeilen ohne eigenes Load-More/
// Pagination — die Begrenzung (aktuell 10) erfolgt beim Abruf in
// admin/page.tsx, der Link "Alle Termine" führt zur vollen Liste.
export function NaechsteTermineTabelle({
  termine,
}: {
  termine: NaechsterTerminZeile[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Termin</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead>Mannschaft</TableHead>
          <TableHead>Ort</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {termine.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.zeit}</TableCell>
            <TableCell>
              <Badge variant="secondary">{t.typLabel}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {t.mannschaft ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {t.ort ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  return (
    <Table>
      <TableBody>
        {posten.flatMap((p) =>
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
  );
}
