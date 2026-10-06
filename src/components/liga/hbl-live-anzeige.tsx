"use client";

import { useEffect, useState } from "react";

type Stand = { status: "scheduled" | "live" | "halftime" | "finished"; heimTore: number; gastTore: number };

// Einfacher Live-Stand eines HBL-Spiels (öffentliche Spielseite der HBL über unsere API): holt alle 15 Sekunden, solange der Tab
// sichtbar ist. Ohne Antwort bleibt der bisherige Text stehen.
export function HblLiveAnzeige({ matchId, fallback }: { matchId: string; fallback: string }) {
  const [stand, setStand] = useState<Stand | null>(null);
  useEffect(() => {
    let aktiv = true;
    const lade = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/liga/hbl-live/${matchId}`);
        if (!res.ok) return;
        const daten = (await res.json()) as { stand: Stand | null };
        if (aktiv && daten.stand) setStand(daten.stand);
      } catch {
        // Netzfehler: alter Stand bleibt
      }
    };
    void lade();
    const timer = setInterval(lade, 15_000);
    return () => {
      aktiv = false;
      clearInterval(timer);
    };
  }, [matchId]);
  if (!stand || (stand.status !== "live" && stand.status !== "halftime")) {
    return <p className="text-right text-xs font-medium text-muted-foreground">{stand?.status === "finished" ? "Beendet" : fallback}</p>;
  }
  return (
    <div className="text-right">
      <p className="font-heading text-xl leading-tight font-bold tabular-nums">
        {stand.heimTore}:{stand.gastTore}
      </p>
      <p className="text-[10px] text-muted-foreground">{stand.status === "halftime" ? "Halbzeit" : "live"}</p>
    </div>
  );
}
