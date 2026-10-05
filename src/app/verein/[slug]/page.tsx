import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { sammleVereinsSpiele } from "@/lib/liga-spiele-hilfen";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { InstallHinweis } from "@/components/liga/installieren";
import { WochenKarte } from "@/components/liga/statistik-karte";
import { berechneWoche } from "@/lib/spiel-statistik";
import { tagKey } from "@/lib/kalender";
import { formatTagKopf, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { ladeVereinsDaten } from "./laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Ergebnisse, Spielplan & Mannschaften | Handballerpate`,
    description: `Letzte Ergebnisse, nächste Spiele und alle Mannschaften des ${verein.name} auf Handballerpate.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}` },
    openGraph: { title: verein.name, type: "website", locale: "de_DE" },
  };
}

// Startseite des Vereins: die letzten Ergebnisse aller Mannschaften.
export default async function ErgebnisseSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften, basis } = await ladeVereinsDaten(slug);
  const jetzt = new Date();
  const { ergebnisse } = sammleVereinsSpiele(mannschaften, jetzt);
  const woche = berechneWoche(mannschaften, jetzt, tagKey(jetzt));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: verein.name,
    sport: "Handball",
    url: `${appUrl()}${basis}`,
  };

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
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
          eintraege={ergebnisse.map((e) => ({
            id: e.spiel.id,
            tag: formatTagKopf(e.spiel.datum),
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
