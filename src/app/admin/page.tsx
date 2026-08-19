import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import {
  formatMannschaft,
  holeLetzteErgebnisse,
  holeNaechsteTermine,
} from "@/lib/dashboard";
import { berechneGesamtbilanz, holeMannschaftsBilanzen } from "@/lib/dienste-statistik";
import { parseMonatParam } from "@/lib/kalender";
import { holeAdminKalenderDaten } from "@/lib/admin-kalender";
import { MonatsKalender } from "@/components/monats-kalender";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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

// Bei rundenspiel-Terminen ist beschreibung = [titel, kategorie, spielArt,
// zusatz].join(" · ") (siehe rundenspiel-import.ts) — titel (Heim –
// Auswärts) und kategorie zeigt die Mannschaft-Spalte hier schon per
// formatMannschaft an, daher als Untertitel nur den Rest (Spielart inkl.
// Spielnummer, plus Zusatz wie z.B. das nuLiga-Schiedsrichter-Kürzel), damit
// die Zeile nicht doppelt Mannschaft/Kategorie ausweist.
function kuerzeBeschreibung(t: {
  typ: string;
  beschreibung: string | null;
  kategorie: string | null;
}): string | null {
  if (t.typ !== "rundenspiel" || !t.beschreibung) return t.beschreibung;
  const rest = t.beschreibung
    .split(" · ")
    .slice(1)
    .filter((teil) => teil !== t.kategorie);
  return rest.length ? rest.join(" · ") : null;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  const [naechsteTermine, letzteErgebnisse, mannschaftsBilanzen, kalenderDaten] =
    await Promise.all([
      // Wie "Letzte Ergebnisse" auf 10 begrenzt — für die volle Liste gibt es
      // den Link "Alle Termine" unten.
      holeNaechsteTermine(vereinId, 10),
      holeLetzteErgebnisse(vereinId, 10),
      // Ungekappt (anders als letzteErgebnisse oben) — die Saison-KPIs unten
      // sollen die echte Gesamtbilanz zeigen, nicht nur die der letzten 10
      // angezeigten Ergebnisse.
      holeMannschaftsBilanzen(vereinId),
      // Derselbe Monatskalender wie auf /admin/kalender, hier direkt unter
      // den KPI-Kacheln eingebettet — "alles Wichtige auf einen Blick" statt
      // extra dorthin navigieren zu müssen.
      holeAdminKalenderDaten(vereinId, jahr, monatNull),
    ]);
  const { spiele: gesamtSpiele, siegquote } = berechneGesamtbilanz(mannschaftsBilanzen);

  const naechsteTermineZeilen = naechsteTermine.map((t) => ({
    id: t.id,
    zeit: formatDateTime(t.start),
    typLabel:
      t.typ === "rundenspiel"
        ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
        : (TYP_LABEL[t.typ] ?? t.typ),
    ort: t.ort,
    mannschaft: formatMannschaft(t),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Übersicht</h1>
        <p className="text-sm text-muted-foreground">
          {verein?.name ?? "Verein"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Rundenspiele mit Ergebnis</CardDescription>
            <CardTitle className="text-3xl">{gesamtSpiele}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Siegquote (alle Mannschaften)</CardDescription>
            <CardTitle className="text-3xl">
              {siegquote !== null ? `${siegquote}%` : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kalender</CardTitle>
        </CardHeader>
        <CardContent>
          <MonatsKalender
            jahr={jahr}
            monatNull={monatNull}
            eintraegeProTag={kalenderDaten.eintraegeProTag}
            mehrtaegigeEintraege={kalenderDaten.mehrtaegigeEintraege}
            mannschaftsListe={kalenderDaten.mannschaftsListe}
            trainerListe={kalenderDaten.trainerListe}
            zuordenbarePersonen={kalenderDaten.zuordenbarePersonen}
            basisPfad="/admin"
            schreibzugriff={session.user.istAdmin}
          />
        </CardContent>
      </Card>

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
            {/* /admin/termine zeigt bewusst nur manuell angelegte
                Freundschaftsspiele/Turniere (siehe dortiger Typ-Filter),
                keine importierten Rundenspiele — für "wirklich alle" geht
                es deshalb zum vollständigen Kalender statt dorthin. */}
            <Link
              href="/admin/kalender"
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
                    <TableHead>Mannschaft</TableHead>
                    <TableHead>Ergebnis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {letzteErgebnisse.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {formatDateTime(t.start)}
                        {kuerzeBeschreibung(t) && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {kuerzeBeschreibung(t)}
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
                      <TableCell className="text-muted-foreground">
                        {formatMannschaft(t) ?? "—"}
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
    </div>
  );
}
