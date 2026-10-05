import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { MannschaftsKennzahlen } from "@/lib/spiel-statistik";
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
    </Card>
  );
}
