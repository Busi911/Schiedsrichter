import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type UnbesetzterTerminZeile = {
  terminId: string;
  zeit: string;
  typLabel: string;
  ort: string | null;
  mannschaft: string | null;
  schiriOffen: boolean;
  zeitnehmerOffen: boolean;
};

// Ersetzt die frühere "Nächste Termine"-Tabelle auf dem Dashboard — der dort
// eingebettete Monatskalender (siehe admin/page.tsx) zeigt ohnehin schon ALLE
// anstehenden Termine, hier interessiert stattdessen nur noch, wo konkret
// noch Schiedsrichter und/oder Zeitnehmer/Sekretär fehlen.
export function UnbesetzteTermineTabelle({
  termine,
}: {
  termine: UnbesetzterTerminZeile[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Termin</TableHead>
          <TableHead>Mannschaft</TableHead>
          <TableHead>Fehlt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {termine.map((t) => (
          <TableRow key={t.terminId}>
            <TableCell className="font-medium">
              {t.zeit}
              <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-normal text-muted-foreground">
                <Badge variant="secondary">{t.typLabel}</Badge>
                {t.ort}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {t.mannschaft ?? "—"}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {t.schiriOffen && <Badge variant="warning">Schiedsrichter</Badge>}
                {t.zeitnehmerOffen && <Badge variant="warning">Zeitnehmer</Badge>}
              </div>
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
  typLabel: string;
  mannschaft: string | null;
  luecken: { rolle: string; vorhanden: number; bedarf: number }[];
};

export function UnbesetzteDiensteTabelle({
  posten,
}: {
  posten: OffenerPostenZeile[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Termin</TableHead>
          <TableHead>Fehlende Rollen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posten.map((p) => (
          <TableRow key={p.terminId}>
            <TableCell className="w-0 align-top text-sm whitespace-normal">
              <div className="font-medium">{p.zeit}</div>
              <div className="mt-0.5">
                <Badge variant="outline">{p.typLabel}</Badge>
              </div>
              {p.mannschaft && (
                <div className="text-xs text-muted-foreground">
                  {p.mannschaft}
                </div>
              )}
            </TableCell>
            <TableCell className="text-sm whitespace-normal">
              {/* Alle fehlenden Rollen dieses Termins nebeneinander in EINER
                  Zeile statt je einer eigenen Tabellenzeile — kompakter und
                  ein Termin mit mehreren Lücken bleibt auf einen Blick
                  zusammenhängend, statt über mehrere Zeilen aufgeteilt zu
                  wirken. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {p.luecken.map((l) => (
                  <div key={l.rolle} className="flex items-center gap-2">
                    <Badge variant="warning">{l.rolle}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {l.vorhanden} von {l.bedarf} besetzt
                    </span>
                  </div>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
