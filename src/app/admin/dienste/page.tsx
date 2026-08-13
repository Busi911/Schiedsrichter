import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { holeOffenePosten } from "@/lib/dashboard";
import {
  holeAnzahlAktiverDienstleistender,
  holeMannschaftsBilanzen,
  holeTopDienstmenschen,
} from "@/lib/dienste-statistik";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UnbesetzteDiensteTabelle } from "@/components/dashboard-tabellen";
import { ErfolgreichsteMannschaftenChart } from "@/components/erfolgreichste-mannschaften-chart";
import { TopDienstmenschenChart } from "@/components/top-dienstmenschen-chart";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  zeitnehmer: "Zeitnehmer/Sekretär",
};

// Vormals eine Karte auf /admin — jetzt eigene Seite, weil der Admin diese
// Übersicht nur noch bei Bedarf ansieht (Zähler-Badge im Header, siehe
// AdminLayout), statt sie dauerhaft auf der Übersicht zu sehen. Die
// eigentliche Besetzung übernehmen die jeweiligen Wart-Rollen.
export default async function DienstePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [offenePosten, mannschaftsBilanzen, topDienstmenschen, anzahlAktive] =
    await Promise.all([
      holeOffenePosten(vereinId),
      holeMannschaftsBilanzen(vereinId),
      holeTopDienstmenschen(vereinId, 8),
      holeAnzahlAktiverDienstleistender(vereinId),
    ]);

  const gesamtSpiele = mannschaftsBilanzen.reduce((sum, b) => sum + b.spiele, 0);
  const gesamtSiege = mannschaftsBilanzen.reduce((sum, b) => sum + b.siege, 0);
  const siegquote = gesamtSpiele > 0 ? Math.round((gesamtSiege / gesamtSpiele) * 100) : null;
  // Top 8 nach Siegquote sortiert anzeigen (mindestens 1 Spiel) — bei
  // Gleichstand zählt bereits berechneMannschaftsBilanzen die Spielanzahl als
  // Tie-Breaker, hier nur noch auf die Anzeige begrenzt.
  const erfolgreichsteMannschaften = mannschaftsBilanzen.slice(0, 8);

  const offenePostenZeilen = offenePosten.map((p) => ({
    terminId: p.terminId,
    zeit: formatDateTime(p.start),
    mannschaft: p.mannschaftLabel,
    luecken: p.luecken.map((l) => ({
      rolle: ROLLE_LABEL[l.rolle],
      vorhanden: l.vorhanden,
      bedarf: l.bedarf,
    })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">
          Unbesetzte Dienste
        </h1>
        <p className="text-sm text-muted-foreground">
          Offener Ordner-/Kioskdienst-Bedarf sowie fehlende Zeitnehmer/
          Sekretär — ein Termin mit mehreren offenen Rollen zählt hier nur
          einmal.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">
            {offenePostenZeilen.length} offen
          </CardTitle>
          <CardDescription>
            Ordner/Kioskdienst melden sich selbst an, Zeitnehmer/Sekretär
            werden über Zuordnung eingeteilt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {offenePostenZeilen.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Alle Dienste sind besetzt.
            </p>
          ) : (
            <UnbesetzteDiensteTabelle posten={offenePostenZeilen} />
          )}
          <Link
            href="/admin/einstellungen"
            className="mt-1 text-xs text-muted-foreground underline"
          >
            Dienste-Bedarf einstellen
          </Link>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-heading text-xl font-semibold">Statistik</h2>
        <p className="text-sm text-muted-foreground">
          Rundenspiele mit erfasstem Ergebnis sowie Dienste seit Vereinsstart.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
              Sieg/Unentschieden/Niederlage aus dem nuLiga-Rundenspiel-Import.
              Balkenlänge = Spiele relativ zur aktivsten Mannschaft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {erfolgreichsteMannschaften.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Rundenspiel-Ergebnisse mit zugeordneter Mannschaft.
              </p>
            ) : (
              <ErfolgreichsteMannschaftenChart bilanzen={erfolgreichsteMannschaften} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Dienstleistende</CardTitle>
            <CardDescription>
              Absolvierte Einsätze als Schiedsrichter, Zeitnehmer, Sekretär,
              Ordner oder Kioskdienst zusammen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topDienstmenschen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine absolvierten Dienste.
              </p>
            ) : (
              <TopDienstmenschenChart personen={topDienstmenschen} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
