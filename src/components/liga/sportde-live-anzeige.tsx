"use client";

import { useEffect, useState } from "react";

type Stand = { status: "scheduled" | "live" | "halftime" | "finished" | "interrupted" | "postponed" | "cancelled" | null; minute: number | null; heimTore: number | null; gastTore: number | null };

// Abfrageabstand je Zustand (Millisekunden); null = nicht mehr abfragen. Vor dem Anwurf nur selten, laufend alle 15 s, in der Pause alle 30 s.
export function pollIntervall(stand: Stand | null, beginnMs: number, jetzt: number): number | null {
  if (stand?.status === "finished" || stand?.status === "cancelled" || stand?.status === "postponed") return null;
  if (stand?.status === "live") return 15_000;
  if (stand?.status === "halftime") return 30_000;
  if (jetzt < beginnMs - 30 * 60_000) return null; // mehr als 30 Minuten vor dem Anwurf: kein Live-Polling
  if (jetzt < beginnMs) return 120_000;
  return 15_000; // Anwurf erreicht, Stand noch unbekannt
}

// Einfacher Live-Stand eines Bundesliga-Spiels (sport.de über unsere API /api/liga/sportde-live/<ID>): Stand und Minute, solange der Tab
// sichtbar ist. Ohne Antwort bleibt der bisherige Text stehen.
export function SportDeLiveAnzeige({ matchId, beginnMs, fallback }: { matchId: string; beginnMs: number; fallback: string }) {
  const [stand, setStand] = useState<Stand | null>(null);
  useEffect(() => {
    let aktiv = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let letzter: Stand | null = null;
    const lade = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/liga/sportde-live/${matchId}`);
          if (res.ok) {
            const daten = (await res.json()) as { stand: Stand | null };
            if (aktiv && daten.stand) {
              letzter = daten.stand;
              setStand(daten.stand);
            }
          }
        } catch {
          // Netzfehler: alter Stand bleibt
        }
      }
      const naechster = pollIntervall(letzter, beginnMs, Date.now());
      if (aktiv && naechster !== null) timer = setTimeout(lade, naechster);
    };
    void lade();
    return () => {
      aktiv = false;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, beginnMs]);
  const hatStand = stand && stand.heimTore !== null && stand.gastTore !== null && (stand.status === "live" || stand.status === "halftime");
  if (!hatStand) {
    return <p className="text-right text-xs font-medium text-muted-foreground">{stand?.status === "finished" ? "Beendet" : fallback}</p>;
  }
  return (
    <div className="text-right">
      <p className="font-heading text-xl leading-tight font-bold tabular-nums">
        {stand.heimTore}:{stand.gastTore}
      </p>
      <p className="text-[10px] text-muted-foreground">{stand.status === "halftime" ? "Pause" : stand.minute !== null ? `live · ${stand.minute}'` : "live"}</p>
    </div>
  );
}
