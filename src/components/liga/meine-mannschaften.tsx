"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  hinweis: "laeuft" | "ergebnis_folgt" | "ausstehend" | null;
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
  naechste: Spiel[];
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

const STATUS_TEXT: Record<string, string> = {
  verlegt: "Verlegt",
  abgesagt: "Abgesagt",
  nicht_angetreten: "Nicht angetreten",
};
const HINWEIS_TEXT = {
  laeuft: "Läuft gerade",
  ergebnis_folgt: "Ergebnis folgt",
  ausstehend: "Ergebnis ausstehend",
} as const;

const BERLIN = "Europe/Berlin";
const BESUCH_KEY = "hp_meine_besuch";

// Heutiges Datum (YYYY-MM-DD) in deutscher Zeit.
const heuteKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN }).format(new Date());

function relativerTag(datum: string): string {
  const [y, m, d] = datum.split("-").map(Number);
  const [hy, hm, hd] = heuteKey().split("-").map(Number);
  const tage = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86_400_000);
  if (tage === 0) return "heute";
  if (tage === 1) return "morgen";
  if (tage > 1 && tage < 14) return `in ${tage} Tagen`;
  return "";
}

// Letzter Besuch dieser Seite (nur Datum, nur in diesem Browser): daraus "Seit deinem letzten Besuch".
function leseBesuch(): string | null {
  try {
    return localStorage.getItem(BESUCH_KEY);
  } catch {
    return null;
  }
}

function ausgangText(s: Spiel): "Sieg" | "Remis" | "Niederlage" | null {
  if (!s.tore || s.tore.heim === null || s.tore.gast === null) return null;
  const eigen = s.eigenHeim ? s.tore.heim : s.tore.gast;
  const gegner = s.eigenHeim ? s.tore.gast : s.tore.heim;
  return eigen > gegner ? "Sieg" : eigen === gegner ? "Remis" : "Niederlage";
}

type Eintrag = { spiel: Spiel; team: string; verein: string; href: string };
const zeitKey = (s: Spiel) => `${s.datum} ${s.uhrzeit ?? "99:99"}`;

function EintragKarte({ e, mitVerein, ergebnis }: { e: Eintrag; mitVerein: boolean; ergebnis?: boolean }) {
  const s = e.spiel;
  const gegner = s.eigenHeim ? s.gast : s.heim;
  const rel = ergebnis ? "" : relativerTag(s.datum);
  const aus = ergebnis ? ausgangText(s) : null;
  return (
    <Card size="sm" className="relative gap-1 px-4">
      <Link href={e.href} className="absolute inset-0 z-0 rounded-xl" aria-label={`${e.team}: ${s.heim} – ${s.gast}`} />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <CalendarIcon className="size-3.5" />
        <span className={cn("font-medium", rel === "heute" && "text-foreground")}>
          {datumKurz(s.datum)}
          {s.uhrzeit && !ergebnis ? ` · ${s.uhrzeit}` : ""}
          {rel ? ` · ${rel}` : ""}
        </span>
        {STATUS_TEXT[s.status] && <Badge variant="outline">{STATUS_TEXT[s.status]}</Badge>}
        <Badge variant="secondary" className="ml-auto">
          {mitVerein ? `${e.verein} · ${e.team}` : e.team}
        </Badge>
      </p>
      <p className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate">
          {ergebnis ? (
            <span className="block space-y-0.5">
              <span className={cn("block truncate", s.eigenHeim && "font-semibold")}>{s.heim}</span>
              <span className={cn("block truncate", !s.eigenHeim && "font-semibold")}>{s.gast}</span>
            </span>
          ) : (
            <>
              <span className="font-semibold">{s.eigenHeim ? "Heim" : "Auswärts"}</span>
              {s.eigenHeim ? " gegen " : " bei "}
              {gegner}
            </>
          )}
        </span>
        {ergebnis && s.tore && (
          <span className="shrink-0 text-right font-heading text-lg leading-tight font-bold tabular-nums">
            {s.tore.heim}:{s.tore.gast}
            <span className="block text-xs font-normal text-muted-foreground">
              {[aus, s.vorlaeufig && "vorläufig"].filter(Boolean).join(" · ")}
            </span>
          </span>
        )}
        {!ergebnis && s.hinweis && (
          <span
            className={cn(
              "shrink-0 text-sm font-medium",
              s.hinweis === "laeuft" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
            )}
          >
            {HINWEIS_TEXT[s.hinweis]}
          </span>
        )}
      </p>
      {!ergebnis && s.halle && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" />
          {s.halle}
        </p>
      )}
    </Card>
  );
}

// "Meine Mannschaften": Favoriten aus dem localStorage -> öffentliche Daten
// per API. Letzter Stand wird im Browser vorgehalten (und vom Service Worker
// gecacht), damit die Seite auch ohne Empfang etwas zeigt.
export function MeineMannschaften() {
  const f = useFavoriten();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);
  // Stand des letzten Besuchs beim Öffnen der Seite (wird erst beim Verlassen auf "heute" gesetzt).
  const [besuch] = useState<string | null>(leseBesuch);
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

  // Beim Verlassen der Seite den Besuch merken (nur Datum, nur in diesem Browser, kein Tracking).
  useEffect(() => {
    const speichern = () => {
      try {
        localStorage.setItem(BESUCH_KEY, heuteKey());
      } catch {
        // ignorieren
      }
    };
    const beiVerbergen = () => document.visibilityState === "hidden" && speichern();
    window.addEventListener("pagehide", speichern);
    document.addEventListener("visibilitychange", beiVerbergen);
    return () => {
      speichern();
      window.removeEventListener("pagehide", speichern);
      document.removeEventListener("visibilitychange", beiVerbergen);
    };
  }, []);

  // "Jetzt" (läuft / Ergebnis folgt), "Als Nächstes" (alle Favoriten, chronologisch) und "Seit deinem letzten Besuch".
  const { jetzt, naechste, neu, mehrereVereine } = useMemo(() => {
    const alle = new Map<string, Eintrag>();
    const neuListe: Eintrag[] = [];
    const vereineNamen = new Set<string>();
    const nimm = (spiel: Spiel, team: string, verein: string, href: string) => {
      alle.set(`${spiel.datum}|${spiel.uhrzeit}|${spiel.heim}|${spiel.gast}`, { spiel, team, verein, href });
    };
    for (const m of daten?.mannschaften ?? []) {
      vereineNamen.add(m.verein.name);
      const href = `/verein/${m.verein.slug}/${m.slug}`;
      for (const sp of m.naechste ?? (m.naechstes ? [m.naechstes] : [])) nimm(sp, m.name, m.verein.name, href);
      if (besuch && m.letztes?.tore && m.letztes.datum >= besuch) {
        neuListe.push({ spiel: m.letztes, team: m.name, verein: m.verein.name, href });
      }
    }
    for (const v of daten?.vereine ?? []) {
      vereineNamen.add(v.name);
      for (const sp of v.naechste) nimm(sp, sp.team, v.name, `/verein/${v.slug}/spiele`);
    }
    const sortiert = [...alle.values()].sort((a, b) => zeitKey(a.spiel).localeCompare(zeitKey(b.spiel)));
    const laeuft = (e: Eintrag) => e.spiel.hinweis === "laeuft" || e.spiel.hinweis === "ergebnis_folgt";
    return {
      jetzt: sortiert.filter(laeuft),
      naechste: sortiert.filter((e) => !laeuft(e) && e.spiel.status !== "abgesagt").slice(0, 6),
      neu: neuListe.sort((a, b) => zeitKey(b.spiel).localeCompare(zeitKey(a.spiel))).slice(0, 5),
      mehrereVereine: vereineNamen.size > 1,
    };
  }, [daten, besuch]);

  if (f.mannschaften.length === 0 && f.vereine.length === 0) {
    return (
      <div className="rounded-xl bg-background p-6 text-center ring-1 ring-foreground/[0.06]">
        <StarIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-medium">Noch keine Favoriten</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Tippe bei einem Verein oder einer Mannschaft auf den Stern – die Favoriten werden nur auf diesem Gerät
          gespeichert.
        </p>
        <Link href="/verein" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
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
      {jetzt.length > 0 && (
        <section className="space-y-2" aria-labelledby="meine-jetzt">
          <h2 id="meine-jetzt" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Jetzt
          </h2>
          {jetzt.map((e, i) => (
            <EintragKarte key={i} e={e} mitVerein={mehrereVereine} />
          ))}
        </section>
      )}

      {naechste.length > 0 && (
        <section className="space-y-2" aria-labelledby="meine-naechste">
          <h2 id="meine-naechste" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Als Nächstes
          </h2>
          {naechste.map((e, i) => (
            <EintragKarte key={i} e={e} mitVerein={mehrereVereine} />
          ))}
        </section>
      )}

      {neu.length > 0 && (
        <section className="space-y-2" aria-labelledby="meine-neu">
          <h2 id="meine-neu" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Seit deinem letzten Besuch
          </h2>
          {neu.map((e, i) => (
            <EintragKarte key={i} e={e} mitVerein={mehrereVereine} ergebnis />
          ))}
        </section>
      )}

      {daten && daten.vereine.length > 0 && (
        <section className="space-y-2" aria-labelledby="meine-vereine">
          <h2 id="meine-vereine" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Meine Vereine
          </h2>
          {daten.vereine.map((v) => (
            <Card key={v.id} size="sm" className="flex-row items-center justify-between gap-2 px-4">
              <Link
                href={`/verein/${v.slug}`}
                className="inline-flex min-h-11 min-w-0 flex-1 items-center font-heading font-semibold hover:underline"
              >
                <span className="truncate">{v.name}</span>
              </Link>
              <FavoritStern typ="verein" id={v.id} label={v.name} className="-mr-2 shrink-0" />
            </Card>
          ))}
        </section>
      )}

      {daten && daten.mannschaften.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Meine Mannschaften</h2>
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
            </Card>
          ))}
        </section>
      )}

      {!daten && !fehler && (
        <div className="space-y-3" role="status" aria-label="Lädt…">
          {[0, 1].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      )}
      {daten && daten.mannschaften.length === 0 && daten.vereine.length === 0 && (
        <p className="rounded-xl bg-background p-6 text-center text-sm text-muted-foreground ring-1 ring-foreground/[0.06]">
          Zu deinen Favoriten gibt es aktuell keine Daten – der Verein ist eventuell nicht mehr online.
        </p>
      )}
    </div>
  );
}
