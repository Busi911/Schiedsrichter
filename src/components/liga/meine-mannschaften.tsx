"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarIcon, MapPinIcon, StarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useFavoriten } from "@/lib/liga-favoriten-lokal";
import { FavoritStern } from "./favorit-stern";

type Spiel = {
  datum: string;
  uhrzeit: string | null;
  halle: string | null;
  heim: string;
  gast: string;
  eigenHeim: boolean;
  tore: { heim: number | null; gast: number | null } | null;
  vorlaeufig: boolean;
  status: string;
};
type MannschaftDaten = {
  id: string;
  name: string;
  verein: { name: string; slug: string };
  slug: string;
  ligaName: string;
  rang: number | null;
  punkte: { plus: number; minus: number } | null;
  naechstes: Spiel | null;
  letztes: Spiel | null;
};
type VereinDaten = {
  id: string;
  name: string;
  slug: string;
  naechste: (Spiel & { team: string })[];
};
type Antwort = { mannschaften: MannschaftDaten[]; vereine: VereinDaten[] };

const datumKurz = (datum: string) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(`${datum}T12:00:00Z`));

function SpielZeile({ titel, s }: { titel: string; s: Spiel }) {
  return (
    <div className="space-y-0.5 text-xs">
      <p className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CalendarIcon className="size-3.5" />
        {titel}: {datumKurz(s.datum)}
        {s.uhrzeit ? ` · ${s.uhrzeit}` : ""}
      </p>
      <p className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">
          <span className={cn(s.eigenHeim && "font-semibold")}>{s.heim}</span>
          {" – "}
          <span className={cn(!s.eigenHeim && "font-semibold")}>{s.gast}</span>
        </span>
        {s.tore && (
          <span className="shrink-0 font-bold tabular-nums">
            {s.tore.heim}:{s.tore.gast}
            {s.vorlaeufig ? "*" : ""}
          </span>
        )}
      </p>
      {s.halle && !s.tore && (
        <p className="inline-flex items-center gap-1.5 text-muted-foreground">
          <MapPinIcon className="size-3.5" />
          {s.halle}
        </p>
      )}
    </div>
  );
}

// "Meine Mannschaften": Favoriten aus dem localStorage -> öffentliche Daten
// per API. Letzter Stand wird im Browser vorgehalten (und vom Service Worker
// gecacht), damit die Seite auch ohne Empfang etwas zeigt.
export function MeineMannschaften() {
  const f = useFavoriten();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);
  const schluessel = `${f.mannschaften.join(",")}|${f.vereine.join(",")}`;

  useEffect(() => {
    if (f.mannschaften.length === 0 && f.vereine.length === 0) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ m: f.mannschaften.join(","), v: f.vereine.join(",") });
    fetch(`/api/liga/favoriten?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Antwort>) : Promise.reject(new Error("HTTP"))))
      .then((d) => {
        setDaten(d);
        setFehler(false);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setFehler(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schluessel]);

  if (f.mannschaften.length === 0 && f.vereine.length === 0) {
    return (
      <div className="rounded-xl bg-background p-6 text-center ring-1 ring-foreground/[0.06]">
        <StarIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-medium">Noch keine Favoriten</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Tippe bei einem Verein oder einer Mannschaft auf den Stern – die Favoriten werden nur auf diesem Gerät
          gespeichert.
        </p>
        <Link href="/verein" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
          Vereine ansehen
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {fehler && (
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Keine Verbindung – der zuletzt geladene Stand wird angezeigt (falls vorhanden).
        </p>
      )}
      {daten?.vereine.map((v) => (
        <section key={v.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <Link href={`/verein/${v.slug}`} className="font-heading font-semibold hover:underline">
              {v.name}
            </Link>
            <FavoritStern typ="verein" id={v.id} label={v.name} />
          </div>
          {v.naechste.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Spiele angesetzt.</p>
          ) : (
            v.naechste.map((s, i) => (
              <Card key={i} size="sm" className="gap-1 px-4">
                <Badge variant="secondary" className="self-start">
                  {s.team}
                </Badge>
                <SpielZeile titel="Nächstes Spiel" s={s} />
              </Card>
            ))
          )}
        </section>
      ))}

      {daten && daten.mannschaften.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">Mannschaften</h2>
          {daten.mannschaften.map((m) => (
            <Card key={m.id} size="sm" className="relative gap-2 px-4">
              <Link
                href={`/verein/${m.verein.slug}/${m.slug}`}
                className="absolute inset-0 z-0 rounded-xl"
                aria-label={`${m.verein.name} ${m.name}`}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{m.verein.name}</p>
                  <h3 className="font-heading truncate font-semibold">{m.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">{m.ligaName}</p>
                </div>
                <FavoritStern typ="mannschaft" id={m.id} label={m.name} className="relative z-10 -mt-1 -mr-2" />
              </div>
              {m.rang !== null && (
                <Badge variant="secondary" className="self-start">
                  Platz {m.rang}
                  {m.punkte ? ` · ${m.punkte.plus}:${m.punkte.minus} Punkte` : ""}
                </Badge>
              )}
              {m.naechstes && <SpielZeile titel="Nächstes Spiel" s={m.naechstes} />}
              {m.letztes && <SpielZeile titel="Letztes Ergebnis" s={m.letztes} />}
            </Card>
          ))}
        </section>
      )}

      {!daten && !fehler && <p className="text-sm text-muted-foreground">Lädt…</p>}
    </div>
  );
}
