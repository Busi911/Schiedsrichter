import Link from "next/link";
import { CalendarIcon, ChevronRightIcon, ExternalLinkIcon, MapPinIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ZEITZONE } from "@/lib/format";
import { istZwischenstand, laeuftVermutlich, liveTickerRelevant } from "@/lib/liga-spiel-status";
import { quelleFuer } from "@/lib/match-provider";
import { ursprungsTermin } from "@/lib/liga-spiele-hilfen";
import { tagKey } from "@/lib/kalender";
import { ergebnisHinweis, hatErgebnis, type MannschaftAnsicht, type SpielAnsicht } from "@/lib/liga-oeffentlich";
import { FavoritStern } from "./favorit-stern";
import { TeilenButton } from "./teilen-button";
import { SpielDetail } from "./spiel-detail";

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

const AUSGANG_TEXT = { S: "Sieg", U: "Remis", N: "Niederlage" } as const;

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
  teilenPfad,
  mannschaftPfad,
}: {
  spiel: SpielAnsicht;
  eigenTeamtable?: string | null;
  teamLabel?: string;
  // In einer nach Tagen gruppierten Liste steht das Datum schon in der Überschrift.
  nurUhrzeit?: boolean;
  // Farbstreifen links: Sieg/Unentschieden/Niederlage aus Sicht der eigenen Mannschaft.
  mitAusgang?: boolean;
  // Pfad der Seite, die der Teilen-Button weitergibt (die Mannschaftsseite zu diesem Spiel). Ohne Pfad gibt es keinen Button
  // (z.B. im Admin-Bereich, wo die Karte keine öffentliche Adresse hat).
  teilenPfad?: string;
  // Seite der Mannschaft: im Spieldetail erscheint dann "Zur Mannschaft" (nur auf den vereinsweiten Listen, auf der Mannschaftsseite selbst überflüssig).
  mannschaftPfad?: string | null;
}) {
  const jetztSpiel = new Date();
  // Spiele von heute heben sich ab (farbiger Rand und Hintergrund), damit man am Spieltag sofort sieht, was ansteht.
  const istHeute = spiel.datum === tagKey(jetztSpiel);

  // Abgesagte Spiele: Warnstreifen oben, Zeit durchgestrichen, Karte abgedämpft (nie Live/Ticker, siehe `laeuftVermutlich`).
  const istAbgesagt = spiel.status === "abgesagt";
  const laeuft = laeuftVermutlich(spiel, jetztSpiel);
  const zwischenstand = istZwischenstand(spiel, jetztSpiel);
  // Statt einer Zahl: "Läuft gerade" / "Ergebnis folgt" / "Ergebnis ausstehend" (nie ein Zwischenstand als Ergebnis).
  const hinweis = ergebnisHinweis(spiel, jetztSpiel);
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
  const titel = `${spiel.heimName} – ${spiel.gastName}`;
  const detail = (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CalendarIcon className="size-4" />
          {formatSpieltag(spiel.datum, spiel.uhrzeit)}
          {spiel.uhrzeit ? " Uhr" : ""}
        </p>
        {ursprungsTermin(spiel) && <p className="text-xs text-muted-foreground">Ursprünglich: {ursprungsTermin(spiel)}</p>}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {teamLabel && teamLabel !== spiel.heimName && teamLabel !== spiel.gastName && <Badge variant="secondary">{teamLabel}</Badge>}
          {laeuft && <Badge className="bg-rose-600 text-white">Live</Badge>}
          {spiel.istFreundschaft && <Badge variant="outline">Freundschaftsspiel</Badge>}
          {STATUS_LABEL[spiel.status] && <Badge variant="outline">{STATUS_LABEL[spiel.status]}</Badge>}
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 p-3">
        <p className={cn("font-medium", fett(spiel.heimTeamtableId))}>{spiel.heimName}</p>
        <p className={cn("font-medium", fett(spiel.gastTeamtableId))}>{spiel.gastName}</p>
        {hinweis ? (
          <p className={cn("mt-2 text-sm font-medium", hinweis === "laeuft" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>
            {hinweis === "laeuft" ? "Läuft gerade" : hinweis === "ergebnis_folgt" ? "Ergebnis folgt" : "Ergebnis ausstehend"}
          </p>
        ) : hatErgebnis(spiel) && !zwischenstand ? (
          <p className="mt-2 font-heading text-2xl font-bold tabular-nums">
            {spiel.toreHeim}:{spiel.toreGast}
            {!spiel.ergebnisBestaetigt && <span className="ml-2 text-xs font-normal text-muted-foreground">vorläufig</span>}
            {spiel.halbzeitHeim !== null && spiel.halbzeitGast !== null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Halbzeit {spiel.halbzeitHeim}:{spiel.halbzeitGast}
              </span>
            )}
          </p>
        ) : null}
      </div>
      {spiel.halleName && (
        <div className="flex items-start justify-between gap-3">
          <p className="inline-flex items-start gap-1.5">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {spiel.halleName}
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spiel.halleName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 font-medium text-primary hover:underline"
          >
            Route
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      )}
      {mannschaftPfad && (
        <Link href={mannschaftPfad} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline">
          Zur Mannschaft
          <ChevronRightIcon className="size-4" />
        </Link>
      )}
      {(liveUrl || berichtUrl) && (
        <div className="flex flex-wrap gap-x-4">
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline">
              Live-Ticker
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
          {berichtUrl && (
            <a href={berichtUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline">
              {quelleFuer(spiel).berichtLabel}
              <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
  return (
    <SpielDetail titel={titel} detail={detail}>
    <Card
      size="sm"
      className={cn(
        "gap-2 px-4",
        istHeute && !istAbgesagt && "bg-primary/5 ring-2 ring-primary/50",
        istHeute && istAbgesagt && "bg-amber-50 ring-2 ring-amber-500/60 dark:bg-amber-500/10",
        ausgang === "S" && "border-l-4 border-l-emerald-700",
        ausgang === "U" && "border-l-4 border-l-slate-500",
        ausgang === "N" && "border-l-4 border-l-red-700"
      )}
    >
      {istAbgesagt && (
        <p className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
          <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
          {istHeute ? "Heute abgesagt" : "Abgesagt"}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1.5", istAbgesagt && "line-through")}>
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
              <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
              Live
            </Badge>
          )}
          {spiel.istFreundschaft && <Badge variant="outline">Freundschaftsspiel</Badge>}
          {STATUS_LABEL[spiel.status] && <Badge variant="outline">{STATUS_LABEL[spiel.status]}</Badge>}
          <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
        </span>
      </div>
      {ursprungsTermin(spiel) && <p className="text-xs text-muted-foreground">Ursprünglich: {ursprungsTermin(spiel)}</p>}
      <div className={cn("flex items-center justify-between gap-3", istAbgesagt && "opacity-60")}>
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className={cn("truncate", fett(spiel.heimTeamtableId))}>{spiel.heimName}</p>
          <p className={cn("truncate", fett(spiel.gastTeamtableId))}>{spiel.gastName}</p>
        </div>
        {hinweis && (
          <p
            className={cn(
              "shrink-0 text-right text-sm font-medium",
              hinweis === "laeuft" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
            )}
          >
            {hinweis === "laeuft" ? "Läuft gerade" : hinweis === "ergebnis_folgt" ? "Ergebnis folgt" : "Ergebnis ausstehend"}
          </p>
        )}
        {hatErgebnis(spiel) && !zwischenstand && (
          <div className="text-right">
            <p className="font-heading text-xl leading-tight font-bold tabular-nums">
              {spiel.toreHeim}:{spiel.toreGast}
            </p>
            {spiel.halbzeitHeim !== null && spiel.halbzeitGast !== null && (
              <p className="text-xs text-muted-foreground">
                Halbzeit {spiel.halbzeitHeim}:{spiel.halbzeitGast}
              </p>
            )}
            {(ausgang || !spiel.ergebnisBestaetigt) && (
              <p className="text-xs text-muted-foreground">
                {[ausgang && AUSGANG_TEXT[ausgang], !spiel.ergebnisBestaetigt && "vorläufig"].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {spiel.halleName ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spiel.halleName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="-my-3 inline-flex min-h-11 items-center gap-1.5 hover:underline"
            aria-label={`${spiel.halleName} auf der Karte öffnen`}
          >
            <MapPinIcon className="size-3.5" />
            {spiel.halleName}
          </a>
        ) : (
          <span />
        )}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(berichtUrl || liveUrl) && (
            <>
              {liveUrl && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="-my-3 inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
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
                  className="-my-3 inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
                >
                  {quelleFuer(spiel).berichtLabel}
                  <ExternalLinkIcon className="size-3" />
                </a>
              )}
            </>
          )}
          {teilenPfad && <TeilenButton url={teilenPfad} titel={`${spiel.heimName} vs ${spiel.gastName}`} />}
        </span>
      </div>
    </Card>
    </SpielDetail>
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
      Stand: {text} · Quellen: nuLiga (Hessischer Handball-Verband), handball.net (DHB), NDR (1./2. Handball-Bundesliga)
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
        ) : m.spiele.length === 0 && !m.istMeldeliste && m.punkte && m.punkte.plus + m.punkte.minus > 0 ? (
          // Die Tabelle zeigt bereits Punkte, aber es ist kein einziges Spiel gespeichert: der Spielplan
          // wurde nicht gelesen, "Kein Spiel angesetzt" wäre dann falsch.
          <p className="text-xs text-muted-foreground">Spielplan derzeit nicht verfügbar</p>
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
