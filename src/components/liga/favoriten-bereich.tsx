"use client";

import type { ReactNode } from "react";
import { useFavoriten } from "@/lib/liga-favoriten-lokal";

// Zeigt oben auf der Vereinsseite die Karten der Mannschaften, die auf diesem
// Gerät favorisiert wurden. Die Karten selbst werden serverseitig gerendert
// (alle Mannschaften des Vereins) und hier nur ausgewählt.
export function FavoritenBereich({ karten }: { karten: Record<string, ReactNode> }) {
  const f = useFavoriten();
  const gewaehlt = f.mannschaften.filter((id) => id in karten);
  if (gewaehlt.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-lg font-semibold">Meine Mannschaften</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {gewaehlt.map((id) => (
          <div key={id}>{karten[id]}</div>
        ))}
      </div>
    </section>
  );
}
