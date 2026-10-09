"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { sortiereVereine } from "@/lib/vereinsliste";
import { Input } from "@/components/ui/input";
import { FavoritStern } from "./favorit-stern";
import { VereinsAvatar } from "./vereins-avatar";

export type VereinEintrag = { id: string; name: string; slug: string; logoAktualisiertAm?: Date | null };

// maxAnzeige: Startseite zeigt nur die ersten N (alphabetisch); die Suche läuft trotzdem über ALLE Vereine.
export function Vereinsuche({ vereine, maxAnzeige }: { vereine: VereinEintrag[]; maxAnzeige?: number }) {
  const [suche, setSuche] = useState("");
  const alle = sortiereVereine(vereine).filter((v) => v.name.toLowerCase().includes(suche.trim().toLowerCase()));
  const treffer = maxAnzeige ? alle.slice(0, maxAnzeige) : alle;
  const mehr = alle.length - treffer.length;
  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Verein suchen"
          aria-label="Verein suchen"
          className="h-12 pl-10 text-base"
        />
      </div>
      {treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein Verein gefunden.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {treffer.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-background px-4 py-1 ring-1 ring-foreground/[0.06]"
            >
              <Link href={`/verein/${v.slug}`} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 text-base font-medium hover:underline">
                <VereinsAvatar name={v.name} slug={v.slug} logoVersion={v.logoAktualisiertAm ? v.logoAktualisiertAm.getTime() : null} />
                <span className="truncate">{v.name}</span>
              </Link>
              <FavoritStern typ="verein" id={v.id} label={v.name} />
            </li>
          ))}
        </ul>
      )}
      {mehr > 0 && (
        <p className="text-sm text-muted-foreground">
          {suche.trim() ? `${mehr} weitere Treffer — Suche eingrenzen oder ` : `${mehr} weitere Vereine — oben suchen oder `}
          <Link href="/verein" className="font-medium underline underline-offset-4">
            alle Vereine ansehen
          </Link>
          .
        </p>
      )}
    </div>
  );
}
