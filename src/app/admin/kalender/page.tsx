import { requireAdmin } from "@/lib/session";
import { parseMonatParam } from "@/lib/kalender";
import { holeAdminKalenderDaten } from "@/lib/admin-kalender";
import { MonatsKalender } from "@/components/monats-kalender";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);

  const { eintraegeProTag, mehrtaegigeEintraege, mannschaftsListe, trainerListe, zuordenbarePersonen } =
    await holeAdminKalenderDaten(vereinId, jahr, monatNull);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Kalender</h1>
        <p className="text-sm text-muted-foreground">
          Alle Termine des Vereins — Spiele aus dem ICS-Feed sowie Freundschaftsspiele/Turniere. Zum
          Anschauen der Details auf einen Termin klicken.
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-emerald-500" /> Besetzung
            vollständig
          </span>
          <span className="ml-3 inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-destructive" /> Besetzung offen
          </span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <MonatsKalender
            jahr={jahr}
            monatNull={monatNull}
            eintraegeProTag={eintraegeProTag}
            mehrtaegigeEintraege={mehrtaegigeEintraege}
            mannschaftsListe={mannschaftsListe}
            trainerListe={trainerListe}
            zuordenbarePersonen={zuordenbarePersonen}
            basisPfad="/admin/kalender"
            schreibzugriff={session.user.istAdmin}
          />
        </CardContent>
      </Card>
    </div>
  );
}
