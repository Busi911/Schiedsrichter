import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { holeOeffentlicheTrainings } from "@/lib/training-oeffentlich-daten";
import { formatMinuten } from "@/lib/training-ausfall";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { formatTagKopf } from "@/components/liga/liga-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return vereinsSeitenMetadata(verein, {
    titel: `${verein.name} – Training: Zeiten und Ausfälle | HandballerPate`,
    beschreibung: `Wann und wo trainieren die Mannschaften des ${verein.name}? Trainingszeiten der nächsten zwei Wochen, ausfallende Trainings sind markiert.`,
    pfad: "/training",
  });
}

// Reiter "Training" der öffentlichen App: nur, wenn der Verein ihn eingeschaltet hat (Einstellungen → Training), sonst 404 wie jede andere nicht vorhandene Seite.
export default async function TrainingSeite({ params }: Props) {
  const { slug } = await params;
  const { verein } = await ladeVereinsDaten(slug);
  const trainings = await holeOeffentlicheTrainings(verein.vereinId);
  if (!trainings) notFound();

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <BereichsKopf titel="Training" vereinId={verein.id} vereinName={verein.name} slug={verein.slug} pfad="/training" />
      <GefilterteListe
        leerText="Aktuell sind keine Trainings eingetragen."
        eintraege={trainings.map((t) => ({
          id: t.id,
          tag: formatTagKopf(t.datum),
          gruppe: t.gruppe,
          mannschaftIds: t.ligaMannschaftId ? [t.ligaMannschaftId] : [],
          knoten: (
            <Card size="sm" className={t.ausgefallen ? "gap-1 border-dashed px-3 py-3" : "gap-1 px-3 py-3"}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-sm font-semibold tabular-nums ${t.ausgefallen ? "line-through" : ""}`}>
                  {formatMinuten(t.startMinuten)}–{formatMinuten(t.endMinuten)} Uhr
                </span>
                {t.ausgefallen && <Badge variant="warning">Fällt aus</Badge>}
              </div>
              <p className={`text-sm font-medium ${t.ausgefallen ? "line-through" : ""}`}>{t.mannschaft}</p>
              {t.ort && <p className="text-xs text-muted-foreground">{t.ort}</p>}
            </Card>
          ),
        }))}
      />
      <p className="text-xs text-muted-foreground">Die Trainingszeiten kommen direkt vom Verein; bei Änderungen oder Ausfällen gilt, was hier steht. Angezeigt werden die nächsten zwei Wochen.</p>
    </div>
  );
}
