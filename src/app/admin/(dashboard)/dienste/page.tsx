import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { holeOffenePosten } from "@/lib/dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UnbesetzteDiensteTabelle } from "@/components/dashboard-tabellen";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { HilfeHinweis } from "@/components/hilfe-hinweis";

const ROLLE_LABEL: Record<string, string> = {
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  zeitnehmer: "Zeitnehmer/Sekretär",
};

// Vormals eine Karte auf /admin — jetzt eigene Seite, weil der Admin diese
// Übersicht nur noch bei Bedarf ansieht (Zähler-Badge im Header, siehe
// AdminLayout), statt sie dauerhaft auf der Übersicht zu sehen. Die
// eigentliche Besetzung übernehmen die jeweiligen Wart-Rollen.
export default async function DienstePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const offenePosten = await holeOffenePosten(vereinId);

  const offenePostenZeilen = offenePosten.map((p) => ({
    terminId: p.terminId,
    zeit: formatDateTime(p.start),
    typLabel: p.typLabel,
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
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Offene Dienste
        </h1>
          <HilfeHinweis anker="bedarf" />
        </div>
        <p className="text-sm text-muted-foreground">
          Offener Ordner-/Kioskdienst-/Kassierer-Bedarf sowie fehlende
          Zeitnehmer/Sekretär — ein Termin mit mehreren offenen Rollen zählt
          hier nur einmal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {offenePostenZeilen.length} offen
          </CardTitle>
          <CardDescription>
            Ordner/Kioskdienst/Kassierer melden sich selbst an,
            Zeitnehmer/Sekretär werden über Zuordnung eingeteilt.
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
    </div>
  );
}
