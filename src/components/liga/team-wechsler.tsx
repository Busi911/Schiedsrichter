"use client";

import { useRouter } from "next/navigation";
import { useFavoriten } from "@/lib/liga-favoriten-lokal";

type Team = { id: string; slug: string; name: string };

// Wechsel zwischen den Mannschaften des Vereins direkt auf der Mannschaftsseite (Eltern mit mehreren Kindern,
// Trainer mehrerer Teams). Bewusst ein natives <select>: auf dem Handy öffnet es die gewohnte Auswahl des
// Betriebssystems (gut mit einer Hand bedienbar, voll barrierefrei). `replace` statt `push`, damit "Zurück" zur Liste führt
// und nicht durch alle zuvor besuchten Mannschaften. Favoriten stehen oben.
export function TeamWechsler({ basis, aktuellSlug, teams }: { basis: string; aktuellSlug: string; teams: Team[] }) {
  const router = useRouter();
  const favoriten = useFavoriten();
  if (teams.length < 2) return null;
  const fav = teams.filter((t) => favoriten.mannschaften.includes(t.id));
  const rest = teams.filter((t) => !favoriten.mannschaften.includes(t.id));
  const option = (t: Team) => (
    <option key={t.id} value={t.slug}>
      {t.name}
    </option>
  );
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="shrink-0">Mannschaft wechseln</span>
      <select
        value={aktuellSlug}
        onChange={(e) => router.replace(`${basis}/${e.target.value}`)}
        className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base text-foreground"
      >
        {fav.length > 0 ? (
          <>
            <optgroup label="Favoriten">{fav.map(option)}</optgroup>
            <optgroup label="Weitere Mannschaften">{rest.map(option)}</optgroup>
          </>
        ) : (
          teams.map(option)
        )}
      </select>
    </label>
  );
}
