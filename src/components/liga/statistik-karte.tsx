import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Duell, MannschaftsKennzahlen, Woche } from "@/lib/spiel-statistik";
import { formatKurzDatum, FormChips } from "./liga-ui";

const prozent = (teil: number, gesamt: number) => (gesamt > 0 ? Math.round((teil / gesamt) * 100) : 0);

function Bilanzzeile({ label, s, u, n }: { label: string; s: number; u: number; n: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {s} S · {u} U · {n} N
      </span>
    </div>
  );
}

// Punkte (Sieg 2, Unentschieden 1) nach jedem gespielten Spiel als kleine Kurve (reines SVG, kein Chart-Paket).
function Saisonverlauf({ verlauf }: { verlauf: MannschaftsKennzahlen["verlauf"] }) {
  if (verlauf.length < 2) return null;
  const B = 100;
  const H = 32;
  const max = Math.max(...verlauf.map((v) => v.punkte), 1);
  const punkte = verlauf.map((v, i) => `${(i / (verlauf.length - 1)) * B},${H - (v.punkte / max) * (H - 4) - 2}`);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Punkte im Saisonverlauf</span>
        <span className="tabular-nums">{verlauf.at(-1)!.punkte} nach {verlauf.length} Spielen</span>
      </div>
      <svg viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" className="h-10 w-full text-primary" role="img" aria-label="Verlauf der Punkte über die Saison">
        <polyline points={punkte.join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ergebnisChip(d: Duell["spiele"][number]) {
  if (d.eigen === null || d.gegner === null) return { text: formatKurzDatum(d.datum), klasse: "bg-muted text-muted-foreground" };
  const klasse = d.eigen > d.gegner ? "bg-emerald-700 text-white" : d.eigen === d.gegner ? "bg-slate-500 text-white" : "bg-red-700 text-white";
  return { text: `${d.eigen}:${d.gegner}`, klasse };
}

function Duelle({ duelle }: { duelle: Duell[] }) {
  const mehrere = duelle.filter((d) => d.spiele.length > 0);
  if (mehrere.length === 0) return null;
  return (
    <details className="group border-t pt-2">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
        Duelle ({mehrere.length} Gegner)
        <span className="text-xs text-muted-foreground group-open:hidden">anzeigen</span>
        <span className="hidden text-xs text-muted-foreground group-open:inline">ausblenden</span>
      </summary>
      <ul className="mt-1 flex flex-col gap-1.5 text-sm">
        {mehrere.map((d) => (
          <li key={d.gegnerName} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 truncate">{d.gegnerName}</span>
            <span className="flex shrink-0 gap-1">
              {d.spiele.map((s, i) => {
                const c = ergebnisChip(s);
                return (
                  <span key={i} className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${c.klasse}`} title={s.heim ? "Heimspiel" : "Auswärtsspiel"}>
                    {s.heim ? "H " : "A "}
                    {c.text}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">H = Heimspiel, A = Auswärtsspiel. Ohne Ergebnis steht das Datum des Spiels.</p>
    </details>
  );
}

// "Diese Woche in Zahlen" über alle eigenen Mannschaften (Kopf der Ergebnis-Seite).
export function WochenKarte({ w }: { w: Woche }) {
  const offen = w.spiele - w.gespielt;
  return (
    <Card size="sm" className="gap-2 px-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">Diese Woche in Zahlen</h2>
        <span className="text-xs text-muted-foreground">
          {formatKurzDatum(w.von)} – {formatKurzDatum(w.bis)}
        </span>
      </div>
      <p className="text-sm">
        <span className="font-semibold tabular-nums">{w.spiele}</span> Spiele, davon{" "}
        <span className="font-semibold tabular-nums">{w.gespielt}</span> gespielt
        {offen > 0 && <span className="text-muted-foreground"> · noch {offen} offen</span>}
      </p>
      {w.gespielt > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {w.siege} S · {w.unentschieden} U · {w.niederlagen} N
          </span>
          {w.siege + w.unentschieden + w.niederlagen > 0 && (
            <> · Siegquote {Math.round((w.siege / (w.siege + w.unentschieden + w.niederlagen)) * 100)}%</>
          )}{" "}
          · Tore {w.torePlus}:{w.toreMinus}
        </p>
      )}
    </Card>
  );
}

// Statistik einer Mannschaft für den Reiter "Statistik" der öffentlichen App (mobil zuerst, nur Kennzahlen aus
// Ergebnissen: keine Personen, keine Zwischenstände).
export function StatistikKarte({ name, href, k }: { name: string; href: string; k: MannschaftsKennzahlen }) {
  const hz = k.halbzeit;
  return (
    <Card size="sm" className="gap-3 px-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={href} className="min-w-0 font-heading text-base leading-snug font-semibold [overflow-wrap:anywhere] hover:underline">
          {name}
        </Link>
        <FormChips form={k.form} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/60 p-2">
          <p className="font-heading text-xl font-bold tabular-nums">{k.spiele}</p>
          <p className="text-[11px] text-muted-foreground">Spiele</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2">
          <p className="font-heading text-xl font-bold tabular-nums">{k.siegquote}%</p>
          <p className="text-[11px] text-muted-foreground">Siegquote</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2">
          <p className="font-heading text-xl font-bold tabular-nums">
            {k.torePlus}:{k.toreMinus}
          </p>
          <p className="text-[11px] text-muted-foreground">Tore</p>
        </div>
      </div>

      <div
        className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${k.siege} Siege, ${k.unentschieden} Unentschieden, ${k.niederlagen} Niederlagen`}
      >
        {k.siege > 0 && <div className="h-full bg-emerald-700" style={{ width: `${prozent(k.siege, k.spiele)}%` }} />}
        {k.unentschieden > 0 && <div className="h-full bg-slate-500" style={{ width: `${prozent(k.unentschieden, k.spiele)}%` }} />}
        {k.niederlagen > 0 && <div className="h-full bg-red-700" style={{ width: `${prozent(k.niederlagen, k.spiele)}%` }} />}
      </div>

      <div className="flex flex-col gap-1">
        <Bilanzzeile label="Gesamt" s={k.siege} u={k.unentschieden} n={k.niederlagen} />
        <Bilanzzeile label="Heim" s={k.heim.siege} u={k.heim.unentschieden} n={k.heim.niederlagen} />
        <Bilanzzeile label="Auswärts" s={k.auswaerts.siege} u={k.auswaerts.unentschieden} n={k.auswaerts.niederlagen} />
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Tore pro Spiel</span>
          <span className="font-medium tabular-nums">
            {k.schnittPlus} erzielt · {k.schnittMinus} kassiert
          </span>
        </div>
      </div>

      <Saisonverlauf verlauf={k.verlauf} />

      {(k.hoechsterSieg || k.torreichstes) && (
        <div className="flex flex-col gap-1 border-t pt-2 text-sm">
          {k.hoechsterSieg && (
            <p>
              <span className="text-muted-foreground">Höchster Sieg: </span>
              <span className="font-medium tabular-nums">
                {k.hoechsterSieg.eigen}:{k.hoechsterSieg.gegner}
              </span>{" "}
              <span className="text-muted-foreground">
                {k.hoechsterSieg.heim ? "gegen" : "bei"} {k.hoechsterSieg.gegnerName} ({formatKurzDatum(k.hoechsterSieg.datum)})
              </span>
            </p>
          )}
          {k.torreichstes && (
            <p>
              <span className="text-muted-foreground">Torreichstes Spiel: </span>
              <span className="font-medium tabular-nums">
                {k.torreichstes.eigen}:{k.torreichstes.gegner}
              </span>{" "}
              <span className="text-muted-foreground">({k.torreichstes.summe} Tore)</span>
            </p>
          )}
        </div>
      )}

      {hz && hz.spiele >= 3 && (
        <div className="flex flex-col gap-1 border-t pt-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Halbzeit ({hz.spiele} Spiele mit Pausenstand)</p>
          <p>
            Führung zur Pause: <span className="font-medium tabular-nums">{hz.fuehrungZurPause}×</span>
            {hz.fuehrungZurPause > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · davon gewonnen {hz.siegNachFuehrung}×
              </span>
            )}
          </p>
          {hz.gedreht > 0 && (
            <p>
              Nach Rückstand zur Pause gewonnen: <span className="font-medium tabular-nums">{hz.gedreht}×</span>
            </p>
          )}
        </div>
      )}
      <Duelle duelle={k.duelle} />
    </Card>
  );
}
