import type { Metadata } from "next";
import { istVergangen } from "@/lib/liga-oeffentlich";
import { SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { saisonLabel } from "@/lib/saison";
import { ladeTeam } from "../laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return vereinsSeitenMetadata(verein, {
    titel: `${verein.name} ${m.name} – Ergebnisse | HandballerPate`,
    beschreibung: `Alle Ergebnisse der Mannschaft ${m.name} des ${verein.name}${m.ligaName ? ` (${m.ligaName})` : ""} in der Saison ${saisonLabel(new Date())}.`,
    pfad: `/${m.slug}/ergebnisse`,
  });
}

export default async function Ergebnisse({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  const spiele = m.spiele.filter((s) => istVergangen(s, new Date())).reverse();

  return (
    <div className="space-y-3">
      {spiele.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Ergebnisse.</p>
      ) : (
        spiele.map((s) => <SpielKarte key={s.id} spiel={s} eigenTeamtable={m.teamtableId} />)
      )}
      <StandHinweis stand={verein.spieleSynchronisiertAm} />
    </div>
  );
}
