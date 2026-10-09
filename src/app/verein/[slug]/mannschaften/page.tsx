import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { gruppiereMannschaften, holeVerein } from "@/lib/liga-oeffentlich";
import { BereichsKopf } from "@/components/liga/bereichs-kopf";
import { FavoritenBereich } from "@/components/liga/favoriten-bereich";
import { MannschaftsKarte, StandHinweis } from "@/components/liga/liga-ui";
import { Badge } from "@/components/ui/badge";
import { ladeVereinsDaten } from "../laden";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const verein = await holeVerein(slug);
  if (!verein) return { title: "Verein nicht gefunden" };
  return {
    title: `${verein.name} – Mannschaften | HandballerPate`,
    description: `Alle Mannschaften des ${verein.name} mit Liga, Tabellenplatz und nächstem Spiel.`,
    alternates: { canonical: `${appUrl()}/verein/${verein.slug}/mannschaften` },
  };
}

export default async function MannschaftenSeite({ params }: Props) {
  const { slug } = await params;
  const { verein, mannschaften, basis } = await ladeVereinsDaten(slug);
  const gruppen = gruppiereMannschaften(mannschaften);

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      <BereichsKopf titel="Mannschaften" vereinId={verein.id} vereinName={verein.name} />
      {mannschaften.length === 0 ? (
        <p className="rounded-xl bg-background p-6 text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
          Die Mannschaften werden gerade geladen. Bitte in Kürze erneut versuchen.
        </p>
      ) : (
        <>
          <FavoritenBereich
            karten={Object.fromEntries(
              mannschaften.map((m) => [m.id, <MannschaftsKarte key={m.id} basis={basis} m={m} />])
            )}
          />
          <section className="space-y-5">
            {gruppen.map((g) => (
              <div key={g.schluessel} className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  {g.titel} <Badge variant="outline">{g.mannschaften.length}</Badge>
                </h2>
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
    </div>
  );
}
