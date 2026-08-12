import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { holeNaechsteTermine, holeOffenePosten } from "@/lib/dashboard";
import { holeZuschussEinstellungen, holeOffeneEinsaetze } from "@/lib/zuschuss";
import { Badge } from "@/components/ui/badge";
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
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  zeitnehmer: "Zeitnehmer/Sekretär",
};

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const verein = await holeZuschussEinstellungen(vereinId);
  const zuschuesseAktiviert = verein?.zuschuesseAktiviert ?? false;

  const [naechsteTermine, offenePosten, offeneEinsaetze] =
    await Promise.all([
      holeNaechsteTermine(vereinId),
      holeOffenePosten(vereinId),
      zuschuesseAktiviert ? holeOffeneEinsaetze(vereinId) : Promise.resolve([]),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          {verein?.name ?? "Verein"}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nächste Termine</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {naechsteTermine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine anstehenden Termine.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Termin</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Ort</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {naechsteTermine.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(t.start)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t.typ === "rundenspiel"
                            ? rundenspielTypLabel(t.pflichtspiel)
                            : TYP_LABEL[t.typ] ?? t.typ}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.ort ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <CardTitle className="text-base">Unbesetzte Dienste</CardTitle>
            <CardDescription>
              Offener Ordner-/Kioskdienst-Bedarf sowie fehlende Zeitnehmer/
              Sekretär — ein Termin mit mehreren offenen Rollen zählt hier nur
              einmal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {offenePosten.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle Dienste sind besetzt.
              </p>
            ) : (
              <Table>
                <TableBody>
                  {offenePosten.flatMap((p) =>
                    p.luecken.map((l, i) => (
                      <TableRow key={`${p.terminId}-${l.rolle}`}>
                        {i === 0 && (
                          <TableCell
                            rowSpan={p.luecken.length}
                            className="w-0 align-top text-sm font-medium whitespace-normal"
                          >
                            {formatDateTime(p.start)}
                          </TableCell>
                        )}
                        <TableCell className="text-sm whitespace-normal text-muted-foreground">
                          {ROLLE_LABEL[l.rolle]}: {l.vorhanden}/{l.bedarf}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
            <Link
              href="/admin/einstellungen"
              className="mt-1 text-xs text-muted-foreground underline"
            >
              Dienste-Bedarf einstellen
            </Link>
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
