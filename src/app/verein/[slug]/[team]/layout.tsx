import { ChevronLeftIcon } from "lucide-react";
import { FavoritStern } from "@/components/liga/favorit-stern";
import { ScrollNachOben } from "@/components/liga/scroll-nach-oben";
import { TeamTabs } from "@/components/liga/team-tabs";
import { TeamWechsler } from "@/components/liga/team-wechsler";
import { ZurueckButton } from "@/components/zurueck-button";
import { Brotkrumen } from "@/components/liga/brotkrumen";
import { Badge } from "@/components/ui/badge";
import { ladeTeam } from "./laden";

export default async function MannschaftsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; team: string }>;
}) {
  const { slug, team } = await params;
  const { verein, m, mannschaften } = await ladeTeam(slug, team);
  const basis = `/verein/${verein.slug}`;

  return (
    <>
      <ScrollNachOben schluessel={`${verein.slug}/${m.slug}`} />
      <div className="space-y-3">
        <ZurueckButton
          fallbackHref={`${basis}/mannschaften`}
          className="-my-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          Zurück
        </ZurueckButton>
        <Brotkrumen
          kette={[
            { name: "Vereine", href: "/verein" },
            { name: verein.name, href: basis },
            { name: "Mannschaften", href: `${basis}/mannschaften` },
            { name: m.name, href: `${basis}/${m.slug}` },
          ]}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">
              <span className="sr-only">{verein.name} </span>
              {m.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{m.ligaName}</p>
            {m.rang !== null && !m.istMeldeliste && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">Platz {m.rang}</Badge>
                {m.punkte && (
                  <Badge variant="outline">
                    {m.punkte.plus}:{m.punkte.minus} Punkte
                  </Badge>
                )}
              </div>
            )}
          </div>
          <FavoritStern
            typ="mannschaft"
            id={m.id}
            label={m.name}
            className="mt-1 shrink-0"
          />
        </div>
        <TeamWechsler
          basis={basis}
          aktuellSlug={m.slug}
          teams={mannschaften.map((t) => ({ id: t.id, slug: t.slug, name: t.name }))}
        />
      </div>
      <TeamTabs basis={`${basis}/${m.slug}`} />
      {children}
    </>
  );
}
