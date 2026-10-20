import { requireAdmin } from "@/lib/session";
import {
  berechneGesamtbilanz,
  holeAnzahlAktiverDienstleistender,
  holeMannschaftsBilanzenAlleSpiele,
  holeMannschaftsKennzahlenAlleSpiele,
  holeFunktionstraegerDienste,
} from "@/lib/dienste-statistik";
import { DIENST_ROLLEN, DIENST_ROLLE_LABEL } from "@/lib/funktionstraeger-dienste";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErfolgreichsteMannschaftenChart } from "@/components/erfolgreichste-mannschaften-chart";
import { StatistikKarte } from "@/components/liga/statistik-karte";
import { TopDienstmenschenChart } from "@/components/top-dienstmenschen-chart";
import { HilfeHinweis } from "@/components/hilfe-hinweis";

// Vormals als Abschnitt auf /admin/dienste ("Offene Dienste") — passte dort nicht hin: Spielbilanz und Dienst-
// Einsätze sind Auswertungen, keine offenen Aufgaben. Die Bilanz zählt jetzt ALLE Spiele (Heim + Auswärts).
export default async function StatistikPage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { saison: saisonParam } = await searchParams;

  const [mannschaftsBilanzen, mannschaftsDetails, anzahlAktive, dienste] = await Promise.all([
    holeMannschaftsBilanzenAlleSpiele(vereinId),
    holeMannschaftsKennzahlenAlleSpiele(vereinId),
    holeAnzahlAktiverDienstleistender(vereinId),
    holeFunktionstraegerDienste(vereinId, saisonParam ?? null),
  ]);
  const { saison, saisons, personen: funktionstraeger } = dienste;
  const topDienstmenschen = funktionstraeger
    .filter((p) => p.geleistet > 0)
    .slice(0, 8)
    .map((p) => ({ userId: p.userId, name: p.name, email: p.email, anzahlEinsaetze: p.geleistet }));

  const { spiele: gesamtSpiele, siegquote } = berechneGesamtbilanz(mannschaftsBilanzen);
  const erfolgreichsteMannschaften = mannschaftsBilanzen.slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h1 className="font-heading text-2xl font-semibold">Statistik</h1>
          <HilfeHinweis anker="statistik" />
        </div>
        <p className="text-sm text-muted-foreground">
          Alle Spiele mit Ergebnis (Heim und Auswärts) sowie absolvierte Dienste.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Spiele mit Ergebnis</CardDescription>
            <CardTitle className="text-3xl">{gesamtSpiele}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Siegquote (alle Mannschaften)</CardDescription>
            <CardTitle className="text-3xl">{siegquote !== null ? `${siegquote}%` : "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Aktive Dienstleistende</CardDescription>
            <CardTitle className="text-3xl">{anzahlAktive}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erfolgreichste Mannschaften</CardTitle>
            <CardDescription>
              Sieg/Unentschieden/Niederlage aus allen Spielen der Saison (Heim und Auswärts). Balkenlänge = Spiele relativ
              zur aktivsten Mannschaft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {erfolgreichsteMannschaften.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Spiele mit Ergebnis.</p>
            ) : (
              <ErfolgreichsteMannschaftenChart bilanzen={erfolgreichsteMannschaften} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Funktionsträger</CardTitle>
            <CardDescription>
              Absolvierte Einsätze{saison ? ` in der Saison ${saison}` : ""} als Schiedsrichter, Zeitnehmer, Sekretär, Ordner,
              Kioskdienst, Kassierer oder in eigenen Diensten zusammen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topDienstmenschen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine absolvierten Dienste.</p>
            ) : (
              <TopDienstmenschenChart personen={topDienstmenschen} />
            )}
          </CardContent>
        </Card>
      </div>

      <div id="funktionstraeger" className="flex scroll-mt-6 flex-col gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Dienste je Funktionsträger</h2>
          <p className="text-sm text-muted-foreground">
            „Geleistet“ = Termin ist vorbei, „eingetragen“ = Termin liegt noch vor uns. Aufgeteilt nach Rolle.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="saison" className="text-sm font-medium">
              Saison
            </label>
            <select
              id="saison"
              name="saison"
              defaultValue={saison ?? ""}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              <option value="">Alle Saisons</option>
              {saisons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Anzeigen
          </Button>
          <a
            href={`/admin/statistik/export${saison ? `?saison=${encodeURIComponent(saison)}` : ""}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Excel-Export
          </a>
        </form>
        {funktionstraeger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Funktionsträger.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Geleistet</TableHead>
                <TableHead className="text-right">Eingetragen</TableHead>
                <TableHead>Nach Rolle (geleistet / eingetragen)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funktionstraeger.map((p) => (
                <TableRow key={p.userId}>
                  <TableCell className="font-medium">{p.name ?? p.email}</TableCell>
                  <TableCell className="text-right">{p.geleistet}</TableCell>
                  <TableCell className="text-right">{p.eingetragen}</TableCell>
                  <TableCell className="whitespace-normal text-sm text-muted-foreground">
                    {DIENST_ROLLEN.filter((r) => p.nachRolle[r])
                      .map((r) => `${DIENST_ROLLE_LABEL[r]} ${p.nachRolle[r]!.geleistet} / ${p.nachRolle[r]!.eingetragen}`)
                      .join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {mannschaftsDetails.length > 0 && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Mannschaften im Detail</h2>
            <p className="text-sm text-muted-foreground">
              Dieselben Kennzahlen wie im Statistik-Reiter der öffentlichen App: Form, Tore, Heim/Auswärts, höchster Sieg,
              Halbzeit.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mannschaftsDetails.map((m) => (
              <StatistikKarte key={m.id} name={m.name} liga={m.liga} href={m.href} k={m.k} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
