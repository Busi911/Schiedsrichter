import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeVerein } from "@/lib/liga-oeffentlich";
import { sammleVereinsSpiele } from "@/lib/liga-spiele-hilfen";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { GefilterteListe } from "@/components/liga/gefilterte-liste";
import { formatTagKopf, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Nächste Spiele | Handballerpate`,
    description: `Alle anstehenden Spiele der Mannschaften des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/spiele` },
  };
}

export default async function NaechsteSpieleSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften } = await ladeVereinsDaten(slug);
  const { anstehend } = sammleVereinsSpiele(mannschaften, new Date());

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <BereichsKopf titel="Nächste Spiele" vereinId={verein.id} vereinName={verein.name} />
      <GefilterteListe
        leerText="Aktuell sind keine Spiele angesetzt."
        eintraege={anstehend.map((e) => ({
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
            />
          ),
        }))}
      />
      <StandHinweis stand={verein.spieleSynchronisiertAm ?? verein.strukturSynchronisiertAm} />
    </div>
  );
}
