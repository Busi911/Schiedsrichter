import Link from "next/link";
import { monatKey, monatsGitter, tagKey } from "@/lib/kalender";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export type KalenderEintrag = {
  id: string;
  zeit: string;
  label: string;
  typLabel: string;
};

export function MonatsKalender({
  jahr,
  monatNull,
  eintraegeProTag,
  basisPfad,
}: {
  jahr: number;
  monatNull: number;
  eintraegeProTag: Map<string, KalenderEintrag[]>;
  basisPfad: string;
}) {
  const wochen = monatsGitter(jahr, monatNull);
  const vorherigerMonat =
    monatNull === 0 ? { jahr: jahr - 1, monatNull: 11 } : { jahr, monatNull: monatNull - 1 };
  const naechsterMonat =
    monatNull === 11 ? { jahr: jahr + 1, monatNull: 0 } : { jahr, monatNull: monatNull + 1 };
  const monatsName = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date(jahr, monatNull, 1));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href={`${basisPfad}?monat=${monatKey(vorherigerMonat.jahr, vorherigerMonat.monatNull)}`}
          className="text-sm text-muted-foreground underline"
        >
          ← Vorheriger Monat
        </Link>
        <p className="font-heading text-lg font-medium capitalize">{monatsName}</p>
        <Link
          href={`${basisPfad}?monat=${monatKey(naechsterMonat.jahr, naechsterMonat.monatNull)}`}
          className="text-sm text-muted-foreground underline"
        >
          Nächster Monat →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WOCHENTAGE.map((w) => (
          <div
            key={w}
            className="bg-muted px-2 py-1 text-center font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {wochen.flatMap((woche) =>
          woche.map((tag) => {
            const key = tagKey(tag.datum);
            const eintraege = eintraegeProTag.get(key) ?? [];
            return (
              <div
                key={key}
                className={`min-h-24 bg-background p-1.5 ${tag.imMonat ? "" : "opacity-40"}`}
              >
                <p
                  className={`mb-1 text-right text-[0.7rem] ${
                    tag.heute ? "font-bold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {tag.datum.getDate()}
                </p>
                <div className="flex flex-col gap-0.5">
                  {eintraege.map((e) => (
                    <p
                      key={e.id}
                      title={`${e.zeit} ${e.typLabel}: ${e.label}`}
                      className="truncate rounded bg-secondary px-1 py-0.5 text-secondary-foreground"
                    >
                      {e.zeit && <span className="font-medium">{e.zeit} </span>}
                      {e.label}
                    </p>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
