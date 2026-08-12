"use client";

import Link from "next/link";
import {
  monatKey,
  monatsGitter,
  platziereBalken,
  tagKey,
  type TurnierBalken,
} from "@/lib/kalender";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMonatJahr } from "@/lib/format";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export type KalenderEintrag = {
  id: string;
  zeit: string;
  label: string;
  typLabel: string;
  // undefined = für diesen Termin-Typ nicht zutreffend (z.B. Turnier-Container).
  // Wird bei vorhandenem ergebnis ignoriert (siehe unten) — ein bereits
  // abgepfiffenes Spiel braucht keinen Besetzungs-Hinweis mehr.
  besetzung?: "vollstaendig" | "offen";
  ort?: string | null;
  besetzungsDetails?: string[];
  bearbeitenHref?: string;
  // "24:20"-Format, nur gesetzt wenn beide Werte erfasst sind (siehe
  // ergebnisHeim/ergebnisAuswaerts in db/schema.ts).
  ergebnis?: string | null;
};

// Mehrtägiger Balken (z.B. Turnier-Container) — zieht sich als durchgehende
// Leiste über seine Tage, statt wie ein normaler Eintrag nur am Starttag zu
// erscheinen. Bewusst kein Besetzungs-Konzept (siehe KalenderEintrag) — ein
// Turnier-Container selbst ist kein zu besetzendes Ereignis, das sind seine
// Einzelspiele.
export type { TurnierBalken };

export function MonatsKalender({
  jahr,
  monatNull,
  eintraegeProTag,
  mehrtaegigeEintraege = [],
  basisPfad,
}: {
  jahr: number;
  monatNull: number;
  eintraegeProTag: Map<string, KalenderEintrag[]>;
  mehrtaegigeEintraege?: TurnierBalken[];
  basisPfad: string;
}) {
  const wochen = monatsGitter(jahr, monatNull);
  const balkenProWoche = platziereBalken(wochen, mehrtaegigeEintraege);
  const maxLanesGesamt = Math.max(
    0,
    ...balkenProWoche.map((woche) =>
      woche.reduce((max, b) => Math.max(max, b.lane + 1), 0)
    )
  );
  const vorherigerMonat =
    monatNull === 0 ? { jahr: jahr - 1, monatNull: 11 } : { jahr, monatNull: monatNull - 1 };
  const naechsterMonat =
    monatNull === 11 ? { jahr: jahr + 1, monatNull: 0 } : { jahr, monatNull: monatNull + 1 };
  const monatsName = formatMonatJahr(jahr, monatNull);
  const heute = new Date();
  const istAktuellerMonat =
    jahr === heute.getFullYear() && monatNull === heute.getMonth();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href={`${basisPfad}?monat=${monatKey(vorherigerMonat.jahr, vorherigerMonat.monatNull)}`}
          className="text-sm text-muted-foreground underline"
        >
          ← Vorheriger Monat
        </Link>
        <div className="flex items-center gap-3">
          <p className="font-heading text-lg font-medium capitalize">{monatsName}</p>
          {!istAktuellerMonat && (
            <Link
              href={`${basisPfad}?monat=${monatKey(heute.getFullYear(), heute.getMonth())}`}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Heute
            </Link>
          )}
        </div>
        <Link
          href={`${basisPfad}?monat=${monatKey(naechsterMonat.jahr, naechsterMonat.monatNull)}`}
          className="text-sm text-muted-foreground underline"
        >
          Nächster Monat →
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border bg-border text-xs">
        <div className="grid grid-cols-7 gap-px bg-border">
          {WOCHENTAGE.map((w) => (
            <div
              key={w}
              className="bg-muted px-2 py-1 text-center font-medium text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-px bg-border">
          {wochen.map((woche, wocheIdx) => {
            const balken = balkenProWoche[wocheIdx];
            // Jede Tageszelle bekommt denselben Vorsprung (Anzahl Balken-
            // Zeilen der GESAMTEN Monatsansicht, nicht nur dieser Woche) —
            // sonst würde die Kartenhöhe von Woche zu Woche springen, je
            // nachdem wie viele Balken gerade laufen.
            return (
              <div
                key={wocheIdx}
                className="grid grid-cols-7 gap-px bg-border"
                style={{
                  gridTemplateRows: `auto repeat(${maxLanesGesamt}, 1.1rem) 1fr`,
                }}
              >
                {woche.map((tag, tagIdx) => {
                  const key = tagKey(tag.datum);
                  return (
                    <div
                      key={key}
                      className={`bg-background px-1.5 pt-1.5 ${tag.imMonat ? "" : "opacity-40"} ${
                        tag.heute ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""
                      }`}
                      style={{ gridColumn: tagIdx + 1, gridRow: "1 / -1" }}
                    >
                      <p
                        className={`text-right text-[0.7rem] ${
                          tag.heute ? "font-bold text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {tag.heute ? (
                          <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[0.65rem] text-primary-foreground">
                            {tag.datum.getDate()}
                          </span>
                        ) : (
                          tag.datum.getDate()
                        )}
                      </p>
                    </div>
                  );
                })}

                {balken.map((b) => (
                  <Dialog key={b.id}>
                    <DialogTrigger
                      render={
                        <button
                          type="button"
                          className="mx-px min-w-0 truncate rounded bg-primary px-1.5 text-left text-[0.7rem] font-medium text-primary-foreground hover:bg-primary/90"
                        />
                      }
                      style={{
                        gridColumn: `${b.startSpalte} / span ${b.spannweite}`,
                        gridRow: b.lane + 2,
                      }}
                    >
                      {b.label}
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{b.label}</DialogTitle>
                        <DialogDescription>Turnier</DialogDescription>
                      </DialogHeader>
                      {b.href && (
                        <Button
                          size="sm"
                          className="mt-2 w-fit"
                          render={<Link href={b.href} />}
                          nativeButton={false}
                        >
                          Bearbeiten
                        </Button>
                      )}
                    </DialogContent>
                  </Dialog>
                ))}

                {woche.map((tag, tagIdx) => {
                  const key = tagKey(tag.datum);
                  const eintraege = eintraegeProTag.get(key) ?? [];
                  return (
                    <div
                      key={`entries-${key}`}
                      className="flex min-w-0 flex-col gap-0.5 px-1.5 pb-1.5"
                      style={{ gridColumn: tagIdx + 1, gridRow: maxLanesGesamt + 2 }}
                    >
                      {eintraege.map((e) => (
                        <Dialog key={e.id}>
                          <DialogTrigger
                            render={
                              <button
                                type="button"
                                className="flex w-full items-center gap-1 truncate rounded bg-secondary px-1 py-0.5 text-left text-secondary-foreground hover:bg-secondary/70"
                              />
                            }
                          >
                            {/* Ein bereits abgepfiffenes Spiel (Ergebnis erfasst) braucht
                                keinen Besetzungs-Hinweis mehr — der ist dann ohnehin
                                hinfällig. */}
                            {e.besetzung && !e.ergebnis && (
                              <span
                                className={`inline-block size-1.5 shrink-0 rounded-full ${
                                  e.besetzung === "vollstaendig"
                                    ? "bg-emerald-500"
                                    : "bg-amber-500"
                                }`}
                              />
                            )}
                            {e.zeit && <span className="font-medium">{e.zeit} </span>}
                            <span className="truncate">{e.label}</span>
                            {e.ergebnis && (
                              <span className="ml-auto shrink-0 font-medium">
                                {e.ergebnis}
                              </span>
                            )}
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{e.label}</DialogTitle>
                              <DialogDescription>
                                {e.typLabel}
                                {e.zeit ? ` · ${e.zeit} Uhr` : ""}
                                {e.ort ? ` · ${e.ort}` : ""}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-2 text-sm">
                              {e.ergebnis ? (
                                <Badge variant="secondary" className="w-fit">
                                  Endstand {e.ergebnis}
                                </Badge>
                              ) : (
                                e.besetzung && (
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        e.besetzung === "vollstaendig" ? "secondary" : "outline"
                                      }
                                    >
                                      {e.besetzung === "vollstaendig"
                                        ? "Besetzung vollständig"
                                        : "Besetzung offen"}
                                    </Badge>
                                  </div>
                                )
                              )}
                              {e.besetzungsDetails && e.besetzungsDetails.length > 0 && (
                                <ul className="flex flex-col gap-1 text-muted-foreground">
                                  {e.besetzungsDetails.map((d) => (
                                    <li key={d}>{d}</li>
                                  ))}
                                </ul>
                              )}
                              {e.bearbeitenHref && (
                                <Button
                                  size="sm"
                                  className="mt-2"
                                  render={<Link href={e.bearbeitenHref} />}
                                  nativeButton={false}
                                >
                                  Bearbeiten
                                </Button>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
