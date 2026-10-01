"use client";

import Link from "next/link";
import { useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FavoritStern } from "./favorit-stern";

export type VereinEintrag = { id: string; name: string; slug: string };

export function Vereinsuche({ vereine }: { vereine: VereinEintrag[] }) {
  const [suche, setSuche] = useState("");
  const treffer = vereine.filter((v) => v.name.toLowerCase().includes(suche.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Verein suchen"
          aria-label="Verein suchen"
          className="pl-9"
        />
      </div>
      {treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Kein Verein gefunden.</p>
      ) : (
        <ul className="grid gap-2">
          {treffer.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-background px-4 py-1 ring-1 ring-foreground/[0.06]"
            >
              <Link href={`/verein/${v.slug}`} className="min-w-0 flex-1 truncate py-3 font-medium hover:underline">
                {v.name}
              </Link>
              <FavoritStern typ="verein" id={v.id} label={v.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
