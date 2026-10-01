import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import {
  gruppiereMannschaften,
  holeMannschaften,
  holeVerein,
  istAnstehend,
  sortiereChronologisch,
  type SpielAnsicht,
} from "@/lib/liga-oeffentlich";
import { FavoritStern } from "@/components/liga/favorit-stern";
import { MannschaftsKarte, SpielKarte, StandHinweis } from "@/components/liga/liga-ui";
import { FavoritenBereich } from "@/components/liga/favoriten-bereich";
import { InstallHinweis } from "@/components/liga/installieren";
import { Badge } from "@/components/ui/badge";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Mannschaften, Spielplan & Ergebnisse | Handballerpate`,
    description: `Alle Mannschaften, Spielpläne und Ergebnisse des ${verein.name} auf Handballerpate.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}` },
    openGraph: { title: verein.name, type: "website", locale: "de_DE" },
  };
}

export default async function VereinsSeite({ params }: Props) {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) notFound();

  const mannschaften = await holeMannschaften(verein.id);

  const jetzt = new Date();
  // Nächste Spiele vereinsübergreifend (ein Spiel zweier eigener Teams nur einmal).
  const anstehend = new Map<string, { spiel: SpielAnsicht; teams: string[] }>();
  for (const m of mannschaften) {
    for (const s of m.spiele) {
      if (!istAnstehend(s, jetzt)) continue;
      const eintrag = anstehend.get(s.id) ?? { spiel: s, teams: [] };
      eintrag.teams.push(m.name);
      anstehend.set(s.id, eintrag);
    }
  }
  const naechste = sortiereChronologisch([...anstehend.values()].map((e) => e.spiel))
    .slice(0, 5)
    .map((s) => ({ spiel: s, teams: anstehend.get(s.id)!.teams }));

  const gruppen = gruppiereMannschaften(mannschaften);
  const basis = `/verein/${verein.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: verein.name,
    sport: "Handball",
    url: `${appUrl()}${basis}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">Mannschaften &amp; Spielplan</h1>
        <FavoritStern typ="verein" id={verein.id} label={verein.name} className="shrink-0" />
      </div>
      <InstallHinweis appName={verein.name} />

      {mannschaften.length === 0 ? (
        <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
          Die Mannschaften werden gerade von nuLiga geladen. Bitte in Kürze erneut versuchen.
        </p>
      ) : (
        <>
          <FavoritenBereich
            karten={Object.fromEntries(
              mannschaften.map((m) => [m.id, <MannschaftsKarte key={m.id} basis={basis} m={m} />])
            )}
          />

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">Nächste Spiele</h2>
            {naechste.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aktuell sind keine Spiele angesetzt.</p>
            ) : (
              <div className="grid gap-3">
                {naechste.map(({ spiel, teams }) => (
                  <SpielKarte key={spiel.id} spiel={spiel} teamLabel={teams.join(" · ")} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-5">
            <h2 className="font-heading text-lg font-semibold">Mannschaften</h2>
            {gruppen.map((g) => (
              <div key={g.schluessel} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  {g.titel} <Badge variant="outline">{g.mannschaften.length}</Badge>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.mannschaften.map((m) => (
                    <MannschaftsKarte key={m.id} basis={basis} m={m} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <StandHinweis stand={verein.spieleSynchronisiertAm ?? verein.strukturSynchronisiertAm} />
    </>
  );
}
