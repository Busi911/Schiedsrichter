import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { istAnstehend } from "@/lib/liga-oeffentlich";
import { SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { VORSCHAU_MAX } from "@/lib/verein-vorschau-konstanten";
import { ladeTeam } from "../laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return {
    title: `${verein.name} ${m.name} – Spielplan | Handballerpate`,
    description: `Kommende Spiele der Mannschaft ${m.name} des ${verein.name}.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/${m.slug}/spielplan` },
  };
}

export default async function Spielplan({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m, begrenzt } = await ladeTeam(slug, team);
  const jetzt = new Date();
  const alle = m.spiele.filter((s) => istAnstehend(s, jetzt));
  const spiele = begrenzt ? alle.slice(0, VORSCHAU_MAX) : alle;

  return (
    <div className="space-y-3">
      {spiele.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine kommenden Spiele.</p>
      ) : (
        spiele.map((s) => <SpielKarte key={s.id} spiel={s} eigenTeamtable={m.teamtableId} />)
      )}
      <StandHinweis stand={verein.spieleSynchronisiertAm} />
    </div>
  );
}
