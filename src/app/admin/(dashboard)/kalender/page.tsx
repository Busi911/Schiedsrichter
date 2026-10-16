import { AlertCircle, CheckCircle2 } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { mischeNachZeit, monatKey, monatsBereich, parseMonatParam } from "@/lib/kalender";
import { kalenderArtenZusatz, parseKalenderArten } from "@/lib/kalender-arten";
import { holeKalenderErgaenzung } from "@/lib/kalender-ergaenzung";
import { KalenderFilter } from "@/components/kalender-filter";
import { holeAdminKalenderDaten } from "@/lib/admin-kalender";
import { MonatsKalender } from "@/components/monats-kalender";
import { HilfeHinweis } from "@/components/hilfe-hinweis";

export default async function AdminKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; zeige?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { monat, zeige } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);
  const arten = parseKalenderArten(zeige);
  const { von, bis } = monatsBereich(jahr, monatNull);

  const [daten, ergaenzung] = await Promise.all([
    holeAdminKalenderDaten(vereinId, jahr, monatNull),
    holeKalenderErgaenzung({
      vereinId,
      userId: session.user.id,
      istAdmin: session.user.istAdmin,
      istAdminLesend: !!session.user.istAdminLesend,
      von,
      bis,
      arten,
      ansicht: "admin",
    }),
  ]);
  const { mannschaftsListe, trainerListe, zuordenbarePersonen } = daten;
  // Gesamtkalender: Spiele & Dienste (wenn nicht ausgeblendet) plus Training und Vereinstermine.
  const zeigeSpiele = arten.has("spiele");
  const eintraegeProTag = mischeNachZeit(zeigeSpiele ? daten.eintraegeProTag : new Map(), ergaenzung.eintraege);
  const mehrtaegigeEintraege = zeigeSpiele ? daten.mehrtaegigeEintraege : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h1 className="font-heading text-2xl font-semibold">Kalender</h1>
          <HilfeHinweis anker="kalender" />
        </div>
        <p className="text-sm text-muted-foreground">
          Alles, was im Verein stattfindet: Spiele und Turniere, Trainings (mit Ausfällen) und Vereinstermine. Zum
          Anschauen der Details auf einen Eintrag klicken, mit den Filtern lassen sich Arten ausblenden.
          <span className="ml-2 inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-emerald-700 dark:text-emerald-500" /> Besetzung vollständig
          </span>
          <span className="ml-3 inline-flex items-center gap-1">
            <AlertCircle className="size-3.5 text-destructive" /> Besetzung offen
          </span>
        </p>
      </div>

      <KalenderFilter basisPfad="/admin/kalender" monat={monatKey(jahr, monatNull)} arten={arten} verfuegbar={ergaenzung.verfuegbar} />

      <MonatsKalender
        jahr={jahr}
        monatNull={monatNull}
        eintraegeProTag={eintraegeProTag}
        mehrtaegigeEintraege={mehrtaegigeEintraege}
        mannschaftsListe={mannschaftsListe}
        trainerListe={trainerListe}
        zuordenbarePersonen={zuordenbarePersonen}
        basisPfad="/admin/kalender"
        abfrageZusatz={kalenderArtenZusatz(arten)}
        schreibzugriff={session.user.istAdmin}
      />
    </div>
  );
}
