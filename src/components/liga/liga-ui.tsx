import Link from "next/link";
import { CalendarIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ZEITZONE } from "@/lib/format";
import { hatErgebnis, type MannschaftAnsicht, type SpielAnsicht } from "@/lib/liga-oeffentlich";
import { FavoritStern } from "./favorit-stern";

export function formatSpieltag(datum: string, uhrzeit: string | null): string {
  const text = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
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
}: {
  spiel: SpielAnsicht;
  eigenTeamtable?: string | null;
  teamLabel?: string;
}) {
  const fett = (tt: string | null) =>
    eigenTeamtable && tt === eigenTeamtable ? "font-semibold text-foreground" : "";
  return (
    <Card size="sm" className="gap-2 px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" />
          {formatSpieltag(spiel.datum, spiel.uhrzeit)}
        </span>
        <span className="flex items-center gap-1.5">
          {teamLabel && <Badge variant="secondary">{teamLabel}</Badge>}
          {STATUS_LABEL[spiel.status] && <Badge variant="outline">{STATUS_LABEL[spiel.status]}</Badge>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className={cn("truncate", fett(spiel.heimTeamtableId))}>{spiel.heimName}</p>
          <p className={cn("truncate", fett(spiel.gastTeamtableId))}>{spiel.gastName}</p>
        </div>
        {hatErgebnis(spiel) && (
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
      {spiel.halleName && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" />
          {spiel.halleName}
        </p>
      )}
    </Card>
  );
}

export function FormChips({ form }: { form: ("S" | "U" | "N")[] }) {
  if (form.length === 0) return null;
  const farbe = {
    S: "bg-emerald-600 text-white",
    U: "bg-amber-500 text-white",
    N: "bg-rose-600 text-white",
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
      Stand: {text} · Quelle: nuLiga (Hessischer Handball-Verband)
    </p>
  );
}

export function MannschaftsKarte({
  basis,
  m,
  favorit,
}: {
  basis: string;
  m: MannschaftAnsicht;
  favorit: boolean | null;
}) {
  const n = m.naechstesSpiel;
  const gegner = n
    ? n.heimTeamtableId === m.teamtableId
      ? n.gastName
      : n.heimName
    : null;
  return (
    <Card size="sm" className="relative gap-1.5 px-4 transition hover:ring-foreground/15">
      <Link href={`${basis}/${m.slug}`} className="absolute inset-0 z-0 rounded-xl" aria-label={m.name} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading truncate font-semibold">{m.name}</h3>
          <p className="truncate text-xs text-muted-foreground">{m.ligaName}</p>
        </div>
        <FavoritStern
          typ="mannschaft"
          id={m.id}
          aktiv={favorit}
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
      {n && gegner ? (
        <p className="text-xs text-muted-foreground">
          Nächstes Spiel: {formatKurzDatum(n.datum)}
          {n.uhrzeit ? ` · ${n.uhrzeit}` : ""} · {n.heimTeamtableId === m.teamtableId ? "gegen" : "bei"}{" "}
          {gegner}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Kein Spiel angesetzt</p>
      )}
    </Card>
  );
}
