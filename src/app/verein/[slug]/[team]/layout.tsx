import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { auth } from "@/auth";
import { holeFavoritenIds } from "@/lib/liga-oeffentlich";
import { FavoritStern } from "@/components/liga/favorit-stern";
import { TeamTabs } from "@/components/liga/team-tabs";
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
  const { verein, m } = await ladeTeam(slug, team);
  const session = await auth();
  const favoriten = await holeFavoritenIds(session?.user?.id);
  const basis = `/verein/${verein.slug}`;

  return (
    <>
      <div className="space-y-3">
        <Link
          href={basis}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          {verein.name}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{verein.name}</p>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">{m.name}</h1>
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
            aktiv={session?.user?.id ? favoriten.mannschaften.has(m.id) : null}
            label={m.name}
            className="mt-1 shrink-0"
          />
        </div>
      </div>
      <TeamTabs basis={`${basis}/${m.slug}`} />
      {children}
    </>
  );
}
