import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import {
  holeZeitnehmerEinsaetzeFuerPerson,
  holeZeitnehmerPerson,
  istZeitnehmerwart,
} from "@/lib/zeitnehmerwart";
import { formatMannschaft } from "@/lib/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function ZeitnehmerEinsaetzePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  if (!(await istZeitnehmerwart(vereinId, userId))) {
    notFound();
  }

  const { userId: personId } = await params;
  const [person, einsaetze] = await Promise.all([
    holeZeitnehmerPerson(vereinId, personId),
    holeZeitnehmerEinsaetzeFuerPerson(vereinId, personId),
  ]);
  if (!person) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link
          href="/profil/zeitnehmerwart"
          className="text-sm text-muted-foreground underline"
        >
          ← Zurück zur Übersicht
        </Link>
        <h1 className="font-heading text-2xl font-semibold">
          {person.name ?? person.email}
        </h1>
        <p className="text-sm text-muted-foreground">{person.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Absolvierte Einsätze ({einsaetze.length})
          </CardTitle>
          <CardDescription>
            Als Zeitnehmer oder Sekretär, in beiden Rollen zusammen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {einsaetze.length === 0 ? (
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
                {einsaetze.map((e) => {
                  const typLabel =
                    e.typ === "rundenspiel"
                      ? rundenspielTypLabel(e.pflichtspiel, e.freundschaftsTyp)
                      : (TYP_LABEL[e.typ] ?? e.typ);
                  return (
                    <TableRow key={`${e.terminId}-${e.rolle}`}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {formatDateTime(e.start)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ROLLE_LABEL[e.rolle] ?? e.rolle}
                        </Badge>
                      </TableCell>
                      <TableCell>{typLabel}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatMannschaft(e) ?? e.ort ?? e.beschreibung ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
