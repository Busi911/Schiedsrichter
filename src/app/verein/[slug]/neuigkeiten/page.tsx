import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { holeOeffentlicheNeuigkeiten } from "@/lib/neuigkeiten-daten";
import { absaetze } from "@/lib/neuigkeiten";
import { formatDatum } from "@/lib/format";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  const meta = await vereinsSeitenMetadata(verein, {
    titel: `${verein.name} – Neuigkeiten und Berichte | HandballerPate`,
    beschreibung: `Neuigkeiten und Berichte des ${verein.name}.`,
    pfad: "/neuigkeiten",
  });
  // Feed für Feed-Reader und Browser (die Homepage des Vereins bindet ihn über die Adresse ein).
  return { ...meta, alternates: { ...meta.alternates, types: { "application/rss+xml": `${appUrl()}/verein/${verein.slug}/feed.xml` } } };
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
            <li key={n.id} id={n.id} className="scroll-mt-20">
              <Card size="sm" className="gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-muted-foreground">{formatDatum(n.datum)}</span>
                  {n.mannschaft && <Badge variant="secondary">{n.mannschaft}</Badge>}
                </div>
                <h2 className="font-heading text-base font-semibold [overflow-wrap:anywhere]">{n.titel}</h2>
                {absaetze(n.text).map((a, i) => (
                  <p key={i} className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">
                    {a}
                  </p>
                ))}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Diese Meldungen schreibt der Verein selbst. <a href={`/verein/${verein.slug}/feed.xml`} className="underline">Feed (RSS)</a>
      </p>
    </div>
  );
}
