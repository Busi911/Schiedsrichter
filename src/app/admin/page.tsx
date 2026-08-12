import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { holeLetzteErgebnisse, holeNaechsteTermine } from "@/lib/dashboard";
import { holeZuschussEinstellungen, holeOffeneEinsaetze } from "@/lib/zuschuss";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NaechsteTermineTabelle } from "@/components/dashboard-tabellen";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { formatErgebnis, rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const verein = await holeZuschussEinstellungen(vereinId);
  const zuschuesseAktiviert = verein?.zuschuesseAktiviert ?? false;

  const [naechsteTermine, letzteErgebnisse, offeneEinsaetze] =
    await Promise.all([
      // Hohes Limit statt fest 5/50 — die Übersicht soll auf einen Blick
      // wirklich alle anstehenden Termine zeigen (keine Pagination mehr),
      // 500 ist eine großzügige Sicherheitsgrenze gegen eine unbegrenzte
      // Abfrage, nicht als realistische Kappung gedacht.
      holeNaechsteTermine(vereinId, 500),
      holeLetzteErgebnisse(vereinId, 10),
      zuschuesseAktiviert ? holeOffeneEinsaetze(vereinId) : Promise.resolve([]),
    ]);

  const naechsteTermineZeilen = naechsteTermine.map((t) => ({
    id: t.id,
    zeit: formatDateTime(t.start),
    typLabel:
      t.typ === "rundenspiel"
        ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
        : (TYP_LABEL[t.typ] ?? t.typ),
    ort: t.ort,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          {verein?.name ?? "Verein"}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nächste Termine</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {naechsteTermineZeilen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine anstehenden Termine.
              </p>
            ) : (
              <NaechsteTermineTabelle termine={naechsteTermineZeilen} />
            )}
            <Link
              href="/admin/termine"
              className="mt-1 text-xs text-muted-foreground underline"
            >
              Alle Termine
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Ergebnisse</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {letzteErgebnisse.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Ergebnisse erfasst.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Termin</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Ergebnis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {letzteErgebnisse.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(t.start)}
                        {t.beschreibung && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {t.beschreibung}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t.typ === "rundenspiel"
                            ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
                            : (TYP_LABEL[t.typ] ?? t.typ)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bewusst kein eigenes Grid-Card mehr — bei deaktivierten Zuschüssen
          oder ohne offene Einsätze gibt es hier nichts zu tun, ein leerer/
          negativer Hinweis wäre nur Lärm auf der Übersicht. */}
      {zuschuesseAktiviert && offeneEinsaetze.length > 0 && (
        <Link
          href="/admin/zuschuesse"
          className="text-sm text-muted-foreground underline"
        >
          {offeneEinsaetze.length}{" "}
          {offeneEinsaetze.length === 1 ? "Einsatz" : "Einsätze"} ohne
          Zuschuss
        </Link>
      )}
    </div>
  );
}
