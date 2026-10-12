import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeVerein, holeVereinsDesign } from "@/lib/liga-oeffentlich";
import { jsonLdText, vereinJsonLd } from "@/lib/liga-seo";
import { sammleVereinsSpiele } from "@/lib/liga-spiele-hilfen";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { InstallHinweis } from "@/components/liga/installieren";
import { WochenKarte } from "@/components/liga/statistik-karte";
import { berechneWoche } from "@/lib/spiel-statistik";
import { tagKey } from "@/lib/kalender";
import { formatTagKopf, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { ladeVereinsDaten } from "./laden";

// So viele kommende Spiele stehen an Tagen ohne Spiel oben auf der Startseite des Vereins.
const NAECHSTE_ANZAHL = 5;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Ergebnisse, Spielplan & Mannschaften | HandballerPate`,
    description: `Letzte Ergebnisse, nächste Spiele und alle Mannschaften des ${verein.name} auf HandballerPate.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}` },
  };
}

// Startseite des Vereins: die letzten Ergebnisse aller Mannschaften.
export default async function ErgebnisseSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften, basis } = await ladeVereinsDaten(slug);
  const jetzt = new Date();
  const { ergebnisse, heute, anstehend } = sammleVereinsSpiele(mannschaften, jetzt);
  const woche = berechneWoche(mannschaften, jetzt, tagKey(jetzt));

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
      <BereichsKopf titel="Letzte Ergebnisse" vereinId={verein.id} vereinName={verein.name} />
      <InstallHinweis appName={verein.name} appId={verein.slug} />
      {woche && <WochenKarte w={woche} />}
      {mannschaften.length === 0 ? (
        <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
          Die Mannschaften werden gerade geladen. Bitte in Kürze erneut versuchen.
        </p>
      ) : (
        <GefilterteListe
          leerText="Noch keine Ergebnisse in dieser Saison."
          eintraege={[
            // Oben das, was gerade wichtig ist: am Spieltag "Heute" (laufende und noch offene Spiele, nie als Ergebnis),
            // sonst die nächsten Spiele (die meisten Vereine spielen nur an ein bis zwei Tagen pro Woche, ein leeres
            // "Heute" wäre sonst die Regel). Danach die Ergebnisse.
            ...(heute.length > 0
              ? heute.map((e) => ({ e, tag: "Heute", mitDatum: false }))
              : anstehend.slice(0, NAECHSTE_ANZAHL).map((e) => ({ e, tag: "Nächste Spiele", mitDatum: true }))),
            ...ergebnisse.map((e) => ({ e, tag: formatTagKopf(e.spiel.datum), mitDatum: false })),
          ].map(({ e, tag, mitDatum }) => ({
            id: e.spiel.id,
            tag,
            gruppe: e.gruppe,
            mannschaftIds: e.mannschaftIds,
            knoten: (
              <SpielKarte
                spiel={e.spiel}
                eigenTeamtable={e.eigenTeamtable}
                teamLabel={e.teams.join(" · ")}
                nurUhrzeit={!mitDatum}
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
