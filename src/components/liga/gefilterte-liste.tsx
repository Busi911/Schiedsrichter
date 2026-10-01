"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ListenEintrag = {
  id: string;
  // Überschrift der Tagesgruppe, z.B. "Sonntag, 27.09."
  tag: string;
  gruppe: "herren" | "damen" | "jugend" | "kinder";
  // Serverseitig gerenderte Karte
  knoten: ReactNode;
};

const FILTER: { gruppe: ListenEintrag["gruppe"]; label: string }[] = [
  { gruppe: "herren", label: "Herren" },
  { gruppe: "damen", label: "Damen" },
  { gruppe: "jugend", label: "Jugend" },
  { gruppe: "kinder", label: "Kinder" },
];

// Liste nach Tagen gruppiert, mit Filter-Chips (nur für vorhandene Gruppen).
// Die Karten werden serverseitig gerendert, hier nur ausgewählt.
export function GefilterteListe({ eintraege, leerText }: { eintraege: ListenEintrag[]; leerText: string }) {
  const [filter, setFilter] = useState<ListenEintrag["gruppe"] | null>(null);
  const vorhanden = FILTER.filter((f) => eintraege.some((e) => e.gruppe === f.gruppe));
  const sichtbar = filter ? eintraege.filter((e) => e.gruppe === filter) : eintraege;

  const tage: { tag: string; eintraege: ListenEintrag[] }[] = [];
  for (const e of sichtbar) {
    const letzter = tage.at(-1);
    if (letzter && letzter.tag === e.tag) letzter.eintraege.push(e);
    else tage.push({ tag: e.tag, eintraege: [e] });
  }

  const chip = (aktiv: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition",
      aktiv
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background text-foreground hover:bg-muted"
    );

  return (
    <div className="space-y-4">
      {vorhanden.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
          <button type="button" className={chip(filter === null)} aria-pressed={filter === null} onClick={() => setFilter(null)}>
            Alle
          </button>
          {vorhanden.map((f) => (
            <button
              key={f.gruppe}
              type="button"
              className={chip(filter === f.gruppe)}
              aria-pressed={filter === f.gruppe}
              onClick={() => setFilter(f.gruppe)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {tage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{leerText}</p>
      ) : (
        tage.map((t) => (
          <section key={t.tag} className="space-y-2">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t.tag}</h2>
            <div className="grid gap-2.5">
              {t.eintraege.map((e) => (
                <div key={e.id}>{e.knoten}</div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
