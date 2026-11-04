import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { holeOeffentlicheNeuigkeiten } from "@/lib/neuigkeiten-daten";
import { anzeigeHost } from "@/lib/neuigkeiten";
import { formatDatum } from "@/lib/format";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { Card } from "@/components/ui/card";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  const meta = await vereinsSeitenMetadata(verein, {
    titel: `${verein.name} – Neuigkeiten und Berichte | HandballerPate`,
    beschreibung: `Neuigkeiten und Berichte des ${verein.name} von der Vereinshomepage.`,
    pfad: "/neuigkeiten",
  });
  return meta;
}

// Bereich "Neuigkeiten" der öffentlichen App: nur, wenn der Verein ihn eingeschaltet hat (Einstellungen → Neuigkeiten), sonst 404.
export default async function NeuigkeitenSeite({ params }: Props) {
  const { slug } = await params;
  const { verein } = await ladeVereinsDaten(slug);
  const liste = await holeOeffentlicheNeuigkeiten(verein.vereinId);
  if (!liste) notFound();

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <BereichsKopf titel="Neuigkeiten" vereinId={verein.id} vereinName={verein.name} slug={verein.slug} pfad="/neuigkeiten" />
      {liste.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Neuigkeiten.</p>
      ) : (
        <ul className="space-y-3">
          {liste.map((n) => (
            <li key={n.id}>
              <Card size="sm" className="gap-1.5 px-3 py-3">
                <span className="text-xs text-muted-foreground">{formatDatum(n.datum)}</span>
                <h2 className="font-heading text-base font-semibold [overflow-wrap:anywhere]">{n.titel}</h2>
                {n.auszug && <p className="text-sm [overflow-wrap:anywhere]">{n.auszug}</p>}
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                >
                  Weiterlesen auf {anzeigeHost(n.link)}
                </a>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Die Beiträge kommen von der Homepage des Vereins; zum Lesen öffnet sich dessen Seite.</p>
    </div>
  );
}
