import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeMannschaften, holeVerein, holeVereinsDesign } from "@/lib/liga-oeffentlich";
import { saisonLabel } from "@/lib/saison";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { jsonLdText, vereinJsonLd } from "@/lib/liga-seo";
import { sammleVereinsSpiele } from "@/lib/liga-spiele-hilfen";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { InstallHinweis } from "@/components/liga/installieren";
import { formatTagKopf, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { ladeVereinsDaten } from "./laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  const anzahl = (await holeMannschaften(verein.id)).length;
  return vereinsSeitenMetadata(verein, {
    titel: `${verein.name} – Spielplan, Ergebnisse & Mannschaften ${saisonLabel(new Date())} | HandballerPate`,
    beschreibung:
      anzahl > 0
        ? `Spielplan, Ergebnisse und Tabellen der ${anzahl === 1 ? "Mannschaft" : `${anzahl} Mannschaften`} des ${verein.name} in der Saison ${saisonLabel(new Date())} – ohne Login, auf Handy und Computer.`
        : `Spielplan, Ergebnisse und Tabellen des ${verein.name} in der Saison ${saisonLabel(new Date())}.`,
    pfad: "",
  });
}

// Startseite des Vereins: die letzten Ergebnisse aller Mannschaften.
export default async function ErgebnisseSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften, basis } = await ladeVereinsDaten(slug);
  const jetzt = new Date();
  const { ergebnisse, heute } = sammleVereinsSpiele(mannschaften, jetzt);

  const design = await holeVereinsDesign(verein.id);
  const jsonLd = vereinJsonLd({
    name: verein.name,
    url: `${appUrl()}${basis}`,
    logoUrl: design.logoVersion ? `${appUrl()}/verein/${verein.slug}/logo?v=${design.logoVersion}` : null,
    mannschaften: mannschaften.map((m) => ({ name: m.name, url: `${appUrl()}${basis}/${m.slug}` })),
  });

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(jsonLd) }}
      />
      <BereichsKopf titel="Letzte Ergebnisse" vereinId={verein.id} vereinName={verein.name} slug={verein.slug} pfad="" />
      <InstallHinweis appName={verein.name} appId={verein.slug} />
      {mannschaften.length === 0 ? (
        <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
          Die Mannschaften werden gerade geladen. Bitte in Kürze erneut versuchen.
        </p>
      ) : (
        <GefilterteListe
          leerText="Noch keine Ergebnisse in dieser Saison."
          eintraege={[
            // Am Spieltag oben "Heute" (laufende und noch offene Spiele, nie als Ergebnis), danach die Ergebnisse.
            // Kommende Spiele stehen im Reiter "Spiele".
            ...heute.map((e) => ({ e, tag: "Heute" })),
            ...ergebnisse.map((e) => ({ e, tag: formatTagKopf(e.spiel.datum) })),
          ].map(({ e, tag }) => ({
            id: e.spiel.id,
            tag,
            gruppe: e.gruppe,
            mannschaftIds: e.mannschaftIds,
            knoten: (
              <SpielKarte
                spiel={e.spiel}
                eigenTeamtable={e.eigenTeamtable}
                teamLabel={e.teams.join(" · ")}
                nurUhrzeit
                mitAusgang
              />
            ),
          }))}
        />
      )}
      <StandHinweis stand={verein.spieleSynchronisiertAm ?? verein.strukturSynchronisiertAm} />
    </div>
  );
}
