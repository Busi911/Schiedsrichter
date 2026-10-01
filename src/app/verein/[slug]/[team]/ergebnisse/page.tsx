import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { istVergangen } from "@/lib/liga-oeffentlich";
import { SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { VORSCHAU_MAX } from "@/lib/verein-vorschau-konstanten";
import { ladeTeam } from "../laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return {
    title: `${verein.name} ${m.name} – Ergebnisse | Handballerpate`,
    description: `Ergebnisse der Mannschaft ${m.name} des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/${m.slug}/ergebnisse` },
  };
}

export default async function Ergebnisse({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m, begrenzt } = await ladeTeam(slug, team);
  const alle = m.spiele.filter(istVergangen).reverse();
  const spiele = begrenzt ? alle.slice(0, VORSCHAU_MAX) : alle;

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
