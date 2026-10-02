"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useFavoriten } from "@/lib/liga-favoriten-lokal";
import { cn } from "@/lib/utils";

export type ListenEintrag = {
  id: string;
  // Überschrift der Tagesgruppe, z.B. "Sonntag, 27.09."
  tag: string;
  gruppe: "herren" | "damen" | "jugend" | "kinder";
  // IDs der beteiligten eigenen Mannschaften (für „Favoriten“)
  mannschaftIds: string[];
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
type Filter = ListenEintrag["gruppe"] | "favoriten" | "alle";

export function GefilterteListe({ eintraege, leerText }: { eintraege: ListenEintrag[]; leerText: string }) {
  const favoriten = useFavoriten();
  const istFavorit = (e: ListenEintrag) => e.mannschaftIds.some((id) => favoriten.mannschaften.includes(id));
  const hatFavoriten = eintraege.some(istFavorit);
  // Ohne eigene Auswahl: Favoriten, sobald auf diesem Gerät welche gemerkt sind.
  const [auswahl, setAuswahl] = useState<Filter | null>(null);
  const filter: Filter = auswahl ?? (hatFavoriten ? "favoriten" : "alle");

  // Browser bitten, die gemerkten Favoriten nicht automatisch zu löschen.
  useEffect(() => {
    if (favoriten.mannschaften.length > 0) void navigator.storage?.persist?.().catch(() => {});
  }, [favoriten.mannschaften.length]);

  const vorhanden = FILTER.filter((f) => eintraege.some((e) => e.gruppe === f.gruppe));
  const sichtbar =
    filter === "alle"
      ? eintraege
      : filter === "favoriten"
        ? eintraege.filter(istFavorit)
        : eintraege.filter((e) => e.gruppe === filter);

  const tage: { tag: string; eintraege: ListenEintrag[] }[] = [];
  for (const e of sichtbar) {
    const letzter = tage.at(-1);
    if (letzter && letzter.tag === e.tag) letzter.eintraege.push(e);
    else tage.push({ tag: e.tag, eintraege: [e] });
  }

  const chip = (aktiv: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center rounded-full border-2 px-5 text-base font-semibold shadow-sm transition active:scale-95",
      aktiv
        ? "border-primary bg-primary text-primary-foreground shadow-md"
        : "border-border bg-card text-foreground hover:bg-muted"
    );

  return (
    <div className="space-y-4">
      {(vorhanden.length > 1 || hatFavoriten) && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter">
          {hatFavoriten && (
            <button
              type="button"
              className={chip(filter === "favoriten")}
              aria-pressed={filter === "favoriten"}
              onClick={() => setAuswahl("favoriten")}
            >
              ★ Favoriten
            </button>
          )}
          <button type="button" className={chip(filter === "alle")} aria-pressed={filter === "alle"} onClick={() => setAuswahl("alle")}>
            Alle
          </button>
          {vorhanden.map((f) => (
            <button
              key={f.gruppe}
              type="button"
              className={chip(filter === f.gruppe)}
              aria-pressed={filter === f.gruppe}
              onClick={() => setAuswahl(f.gruppe)}
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
