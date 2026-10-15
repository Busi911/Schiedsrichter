import type { Metadata } from "next";
import { istAnstehend } from "@/lib/liga-oeffentlich";
import { SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { vereinsSeitenMetadata } from "@/lib/seo-meta";
import { ladeTeam } from "../laden";

type Props = { params: Promise<{ slug: string; team: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  return vereinsSeitenMetadata(verein, {
    titel: `${verein.name} ${m.name} – Spielplan | HandballerPate`,
    beschreibung: `Alle kommenden Spiele der Mannschaft ${m.name} des ${verein.name}${m.ligaName ? ` (${m.ligaName})` : ""} mit Datum, Uhrzeit und Halle.`,
    pfad: `/${m.slug}/spielplan`,
  });
}

export default async function Spielplan({ params }: Props) {
  const { slug, team } = await params;
  const { verein, m } = await ladeTeam(slug, team);
  const jetzt = new Date();
  const spiele = m.spiele.filter((s) => istAnstehend(s, jetzt));

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
