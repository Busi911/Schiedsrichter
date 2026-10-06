import Link from "next/link";
import { CalendarIcon, ChevronRightIcon, ExternalLinkIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ZEITZONE } from "@/lib/format";
import { istZwischenstand, laeuftVermutlich, liveTickerRelevant } from "@/lib/liga-spiel-status";
import { quelleFuer } from "@/lib/match-provider";
import { HblLiveAnzeige } from "./hbl-live-anzeige";
import { hatErgebnis, type MannschaftAnsicht, type SpielAnsicht } from "@/lib/liga-oeffentlich";
import { FavoritStern } from "./favorit-stern";

export function formatSpieltag(datum: string, uhrzeit: string | null): string {
  const text = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZEITZONE,
  }).format(new Date(`${datum}T12:00:00Z`));
  return uhrzeit ? `${text} · ${uhrzeit}` : `${text} · Zeit offen`;
}

export function formatKurzDatum(datum: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: ZEITZONE,
  }).format(new Date(`${datum}T12:00:00Z`));
}

// "Sonntag, 27.09.2026" als Überschrift einer Tagesgruppe.
export function formatTagKopf(datum: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZEITZONE,
  }).format(new Date(`${datum}T12:00:00Z`));
}

const STATUS_LABEL: Record<string, string> = {
  verlegt: "Verlegt",
  abgesagt: "Abgesagt",
  nicht_angetreten: "Nicht angetreten",
};

// Ein Spiel als Karte (mobil zuerst). `eigenTeamtable` hebt die eigene
// Mannschaft fett hervor, `teamLabel` zeigt (vereinsweit) zu welcher.
export function SpielKarte({
  spiel,
  eigenTeamtable,
  teamLabel,
  nurUhrzeit,
  mitAusgang,
}: {
  spiel: SpielAnsicht;
  eigenTeamtable?: string | null;
  teamLabel?: string;
  // In einer nach Tagen gruppierten Liste steht das Datum schon in der Überschrift.
  nurUhrzeit?: boolean;
  // Farbstreifen links: Sieg/Unentschieden/Niederlage aus Sicht der eigenen Mannschaft.
  mitAusgang?: boolean;
}) {
  const jetztSpiel = new Date();
  const laeuft = laeuftVermutlich(spiel, jetztSpiel);
  const zwischenstand = istZwischenstand(spiel, jetztSpiel);
  let ausgang: "S" | "U" | "N" | null = null;
  if (!zwischenstand && mitAusgang && eigenTeamtable && hatErgebnis(spiel)) {
    const heim = spiel.heimTeamtableId === eigenTeamtable;
    const eigen = heim ? spiel.toreHeim! : spiel.toreGast!;
    const gegner = heim ? spiel.toreGast! : spiel.toreHeim!;
    ausgang = eigen > gegner ? "S" : eigen === gegner ? "U" : "N";
  }
  // Nur nuLiga-Spiele haben Links (handball.net: null); Verband "HHV" ist aktuell der einzige.
  // Den Spielbericht gibt es erst mit Abschluss des Spiels: nur zeigen, wenn ein Ergebnis angezeigt wird (nicht bei
  // Zwischenstand oder ganz ohne Ergebnis).
  const berichtUrl = hatErgebnis(spiel) && !zwischenstand ? quelleFuer(spiel).berichtUrl(spiel) : null;
  const jetzt = new Date();
  const liveUrl = liveTickerRelevant(spiel, jetzt) ? quelleFuer(spiel).liveUrl(spiel) : null;
  const fett = (tt: string | null) =>
    eigenTeamtable && tt === eigenTeamtable ? "font-semibold text-foreground" : "";
  return (
    <Card
      size="sm"
      className={cn(
        "gap-2 px-4",
        ausgang === "S" && "border-l-4 border-l-emerald-700",
        ausgang === "U" && "border-l-4 border-l-slate-500",
        ausgang === "N" && "border-l-4 border-l-red-700"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" />
          {nurUhrzeit
            ? spiel.uhrzeit
              ? `${spiel.uhrzeit} Uhr`
              : "Zeit offen"
            : formatSpieltag(spiel.datum, spiel.uhrzeit)}
        </span>
        <span className="flex items-center gap-1.5">
          {teamLabel && <Badge variant="secondary">{teamLabel}</Badge>}
          {laeuft && (
            <Badge className="gap-1.5 bg-rose-600 text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              Live
            </Badge>
          )}
          {spiel.istFreundschaft && <Badge variant="outline">Freundschaftsspiel</Badge>}
          {STATUS_LABEL[spiel.status] && <Badge variant="outline">{STATUS_LABEL[spiel.status]}</Badge>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className={cn("truncate", fett(spiel.heimTeamtableId))}>{spiel.heimName}</p>
          <p className={cn("truncate", fett(spiel.gastTeamtableId))}>{spiel.gastName}</p>
        </div>
        {zwischenstand && spiel.quelle === "hbl" && spiel.externeId && (
          <HblLiveAnzeige matchId={spiel.externeId} fallback={laeuft ? "Läuft gerade" : "Ergebnis folgt"} />
        )}
        {zwischenstand && !(spiel.quelle === "hbl" && spiel.externeId) && (
          <p className="text-right text-xs font-medium text-muted-foreground">
            {laeuft ? "Läuft gerade" : "Ergebnis folgt"}
          </p>
        )}
        {hatErgebnis(spiel) && !zwischenstand && (
          <div className="text-right">
            <p className="font-heading text-xl leading-tight font-bold tabular-nums">
              {spiel.toreHeim}:{spiel.toreGast}
            </p>
            {!spiel.ergebnisBestaetigt && (
              <p className="text-[10px] text-muted-foreground">vorläufig</p>
            )}
          </div>
        )}
      </div>
      {(spiel.halleName || berichtUrl || liveUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {spiel.halleName ? (
            <p className="inline-flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" />
              {spiel.halleName}
            </p>
          ) : (
            <span />
          )}
          {(berichtUrl || liveUrl) && (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {liveUrl && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Live-Ticker
                  <ExternalLinkIcon className="size-3" />
                </a>
              )}
              {berichtUrl && (
                <a
                  href={berichtUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Spielbericht
                  <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

export function FormChips({ form }: { form: ("S" | "U" | "N")[] }) {
  if (form.length === 0) return null;
  const farbe = {
    S: "bg-emerald-700 text-white",
    U: "bg-slate-500 text-white",
    N: "bg-red-700 text-white",
  } as const;
  return (
    <div className="flex gap-1" aria-label="Form der letzten Spiele">
      {form.map((f, i) => (
        <span
          key={i}
          className={cn("inline-flex size-6 items-center justify-center rounded text-xs font-bold", farbe[f])}
        >
          {f}
        </span>
      ))}
    </div>
  );
}

export function StandHinweis({ stand }: { stand: Date | null }) {
  if (!stand) return null;
  const text = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ZEITZONE,
  }).format(stand);
  return (
    <p className="text-xs text-muted-foreground">
      Stand: {text} · Quellen: nuLiga (Hessischer Handball-Verband), handball.net (DHB)
    </p>
  );
}

export function MannschaftsKarte({ basis, m }: { basis: string; m: MannschaftAnsicht }) {
  const n = m.naechstesSpiel;
  const gegner = n
    ? n.heimTeamtableId === m.teamtableId
      ? n.gastName
      : n.heimName
    : null;
  return (
    <Card size="sm" className="group relative gap-1.5 px-4 transition hover:bg-muted/40 hover:ring-foreground/25 active:bg-muted/60">
      <Link href={`${basis}/${m.slug}`} className="absolute inset-0 z-0 rounded-xl" aria-label={m.name} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading truncate font-semibold">{m.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{m.ligaName}</p>
        </div>
        <FavoritStern
          typ="mannschaft"
          id={m.id}
          label={m.name}
          className="relative z-10 -mt-1 -mr-2"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {m.rang !== null && !m.istMeldeliste && (
          <Badge variant="secondary">
            Platz {m.rang}
            {m.punkte ? ` · ${m.punkte.plus}:${m.punkte.minus} Punkte` : ""}
          </Badge>
        )}
        {m.istMeldeliste && <Badge variant="outline">Meldeliste</Badge>}
      </div>
      <div className="flex items-end justify-between gap-2">
        {n && gegner ? (
          <p className="text-xs text-muted-foreground">
            Nächstes Spiel: {formatKurzDatum(n.datum)}
            {n.uhrzeit ? ` · ${n.uhrzeit}` : ""} · {n.heimTeamtableId === m.teamtableId ? "gegen" : "bei"}{" "}
            {gegner}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Kein Spiel angesetzt</p>
        )}
        <span className="flex shrink-0 items-center text-xs font-medium text-primary" aria-hidden="true">
          <span className="hidden sm:inline">Öffnen</span>
          <ChevronRightIcon className="size-5 transition-transform group-hover:translate-x-0.5 sm:size-4" />
        </span>
      </div>
    </Card>
  );
}
