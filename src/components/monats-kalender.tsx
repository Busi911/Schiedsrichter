"use client";

import Link from "next/link";
import { monatKey, monatsGitter, tagKey } from "@/lib/kalender";
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

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export type KalenderEintrag = {
  id: string;
  zeit: string;
  label: string;
  typLabel: string;
  // undefined = für diesen Termin-Typ nicht zutreffend (z.B. Turnier-Container)
  besetzung?: "vollstaendig" | "offen";
  ort?: string | null;
  besetzungsDetails?: string[];
  bearbeitenHref?: string;
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
                className={`min-h-24 bg-background p-1.5 ${tag.imMonat ? "" : "opacity-40"} ${
                  tag.heute ? "bg-primary/5 ring-1 ring-inset ring-primary" : ""
                }`}
              >
                <p
                  className={`mb-1 text-right text-[0.7rem] ${
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
                <div className="flex flex-col gap-0.5">
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
                        {e.besetzung && (
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
                          {e.besetzung && (
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
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
