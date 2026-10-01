import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeTabelle } from "@/lib/liga-oeffentlich";
import { StandHinweis } from "@/components/liga/liga-ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ladeTeam } from "../laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return {
    title: `${verein.name} ${m.name} – Tabelle | Handballerpate`,
    description: `Tabelle der ${m.ligaName} mit der Mannschaft ${m.name} des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/${m.slug}/tabelle` },
  };
}

export default async function TabellenSeite({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  const tabelle = m.istMeldeliste ? [] : await holeTabelle(m.gruppeId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{m.ligaName}</p>
      {tabelle.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Für diese Gruppe gibt es noch keine Tabelle.
        </p>
      ) : (
        <div className="rounded-xl bg-background ring-1 ring-foreground/[0.06]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Mannschaft</TableHead>
                <TableHead className="text-right">Sp</TableHead>
                <TableHead className="hidden text-right sm:table-cell">S</TableHead>
                <TableHead className="hidden text-right sm:table-cell">U</TableHead>
                <TableHead className="hidden text-right sm:table-cell">N</TableHead>
                <TableHead className="text-right">Tore</TableHead>
                <TableHead className="text-right">Pkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tabelle.map((z) => {
                const eigen = z.nuligaTeamtableId === m.teamtableId;
                return (
                  <TableRow key={z.id} className={cn(eigen && "bg-primary/5 font-semibold")}>
                    <TableCell className="tabular-nums">{z.rang}</TableCell>
                    <TableCell className="max-w-[10rem] truncate sm:max-w-none">{z.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.spiele ?? "–"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{z.siege ?? "–"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{z.unentschieden ?? "–"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{z.niederlagen ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.torePlus ?? 0}:{z.toreMinus ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.punktePlus ?? 0}:{z.punkteMinus ?? 0}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <StandHinweis stand={verein.spieleSynchronisiertAm} />
    </div>
  );
}
