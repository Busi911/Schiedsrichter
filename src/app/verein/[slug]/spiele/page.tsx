import type { Metadata } from "next";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
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
  return vereinsSeitenMetadata(verein, {
    titel: `${verein.name} – Spielplan: nächste Spiele | HandballerPate`,
    beschreibung: `Wann und wo spielen die Mannschaften des ${verein.name}? Alle anstehenden Spiele mit Datum, Uhrzeit und Halle auf einen Blick.`,
    pfad: "/spiele",
  });
}

export default async function NaechsteSpieleSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften } = await ladeVereinsDaten(slug);
  const { anstehend } = sammleVereinsSpiele(mannschaften, new Date());

  return (
    <div className="space-y-5 pb-28 md:pb-0">
      <BereichsKopf titel="Nächste Spiele" vereinId={verein.id} vereinName={verein.name} slug={verein.slug} pfad="/spiele" />
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
