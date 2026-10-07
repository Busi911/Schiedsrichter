import { requireAdmin } from "@/lib/session";
import {
  berechneGesamtbilanz,
  holeAnzahlAktiverDienstleistender,
  holeMannschaftsBilanzenAlleSpiele,
  holeMannschaftsKennzahlenAlleSpiele,
  holeTopDienstmenschen,
} from "@/lib/dienste-statistik";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErfolgreichsteMannschaftenChart } from "@/components/erfolgreichste-mannschaften-chart";
import { StatistikKarte } from "@/components/liga/statistik-karte";
import { TopDienstmenschenChart } from "@/components/top-dienstmenschen-chart";
import { HilfeHinweis } from "@/components/hilfe-hinweis";

// Vormals als Abschnitt auf /admin/dienste ("Offene Dienste") — passte dort nicht hin: Spielbilanz und Dienst-
// Einsätze sind Auswertungen, keine offenen Aufgaben. Die Bilanz zählt jetzt ALLE Spiele (Heim + Auswärts).
export default async function StatistikPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [mannschaftsBilanzen, mannschaftsDetails, topDienstmenschen, anzahlAktive] = await Promise.all([
    holeMannschaftsBilanzenAlleSpiele(vereinId),
    holeMannschaftsKennzahlenAlleSpiele(vereinId),
    holeTopDienstmenschen(vereinId, 8),
    holeAnzahlAktiverDienstleistender(vereinId),
  ]);

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
            <CardTitle className="text-base">Top Dienstleistende</CardTitle>
            <CardDescription>
              Absolvierte Einsätze als Schiedsrichter, Zeitnehmer, Sekretär, Ordner, Kioskdienst oder Kassierer zusammen.
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
