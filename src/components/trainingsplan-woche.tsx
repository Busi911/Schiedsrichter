"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { GripHorizontalIcon } from "lucide-react";
import {
  trainingszeitAnlegen,
  trainingszeitVerschieben,
} from "@/app/admin/(dashboard)/trainingsplan/actions";
import {
  abteilLabel,
  begrenze,
  formatUhrzeit,
  platziereZeitbloecke,
  rundeAufRaster,
  standardFarbeFuerMannschaft,
  WOCHENTAGE_LABEL_KURZ,
  type HalleMitAbteilen,
} from "@/lib/trainingsplan";
import type { TrainingszeitEintrag } from "@/components/trainingszeit-dialog";

const PX_PRO_MINUTE = 1.1;

type Mannschaft = { id: string; label: string };

type DragZustand =
  | {
      modus: "neu";
      mannschaftId: string;
      mannschaftLabel: string;
      farbe: string;
      dauerMinuten: number;
    }
  | {
      modus: "verschieben";
      block: TrainingszeitEintrag;
      startX: number;
      startY: number;
      bewegt: boolean;
    }
  | { modus: "resize"; block: TrainingszeitEintrag };

type Vorschau = { wochentag: number; startMinuten: number; endMinuten: number };

// Interaktive Wochenansicht EINER Halle (siehe TrainingsplanGrid, das pro
// Halle eine Instanz rendert) — Pointer-Events statt natives HTML5-
// Drag&Drop, da Letzteres auf Touch-Geräten überhaupt nicht funktioniert
// (die App läuft laut CLAUDE.md überwiegend auf dem Handy). Nur hinter
// `hidden md:block` gerendert (siehe TrainingsplanGrid) — auf schmalen
// Bildschirmen übernimmt stattdessen die Mobile-Agenda-Liste mit dem
// Bearbeiten-Dialog dieselben Aktionen ohne Ziehen.
export function TrainingsplanWoche({
  halleId,
  halle,
  mannschaften,
  trainingszeiten,
  gridStartMinuten,
  gridEndMinuten,
  onBlockClick,
  onSlotClick,
}: {
  halleId: string;
  // Für das Abteil-Label im Block (siehe abteilLabel) — nur die Halle des
  // gerade aktiven Tabs, TrainingsplanGrid rendert diese Komponente ja
  // ohnehin pro Halle neu.
  halle: HalleMitAbteilen;
  mannschaften: Mannschaft[];
  trainingszeiten: TrainingszeitEintrag[];
  // Sichtbares Zeitfenster des Grids, vom Verein einstellbar (siehe
  // TrainingsplanGrid) — ein Eintrag außerhalb (theoretisch über den
  // Bearbeiten-Dialog möglich, dessen Zeitfelder keine Grenze haben) würde
  // am Rand abgeschnitten dargestellt statt das Grid unnötig in die Höhe zu
  // treiben.
  gridStartMinuten: number;
  gridEndMinuten: number;
  onBlockClick: (eintrag: TrainingszeitEintrag) => void;
  onSlotClick: (vorgabe: {
    halleId: string;
    wochentag: number;
    startMinuten: number;
    endMinuten: number;
  }) => void;
}) {
  // Lokale Alias-Konstanten statt die Props überall im Rechenteil unten
  // umzubenennen — hält den Diff zum vormals modulweiten Fixwert klein.
  const GRID_START_MINUTEN = gridStartMinuten;
  const GRID_END_MINUTEN = gridEndMinuten;
  const GRID_HOEHE = (GRID_END_MINUTEN - GRID_START_MINUTEN) * PX_PRO_MINUTE;
  const [, startTransition] = useTransition();
  const [dragZustand, setDragZustand] = useState<DragZustand | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const vorschauRef = useRef<Vorschau | null>(null);
  const spaltenRefs = useRef<(HTMLDivElement | null)[]>([]);

  function berechnePosition(
    clientX: number,
    clientY: number
  ): { wochentag: number; minuten: number } | null {
    for (let tag = 0; tag < 7; tag++) {
      const el = spaltenRefs.current[tag];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) {
        const minuten = begrenze(
          rundeAufRaster((clientY - rect.top) / PX_PRO_MINUTE) + GRID_START_MINUTEN,
          GRID_START_MINUTEN,
          GRID_END_MINUTEN
        );
        return { wochentag: tag, minuten };
      }
    }
    return null;
  }

  useEffect(() => {
    if (!dragZustand) return;

    function onMove(e: PointerEvent) {
      const zustand = dragZustand!;
      const pos = berechnePosition(e.clientX, e.clientY);
      if (!pos) return;

      if (zustand.modus === "resize") {
        const ende = begrenze(
          pos.minuten,
          zustand.block.startMinuten + 15,
          GRID_END_MINUTEN
        );
        const naechste: Vorschau = {
          wochentag: zustand.block.wochentag,
          startMinuten: zustand.block.startMinuten,
          endMinuten: ende,
        };
        vorschauRef.current = naechste;
        setVorschau(naechste);
        return;
      }

      if (zustand.modus === "verschieben") {
        if (
          Math.abs(e.clientX - zustand.startX) > 4 ||
          Math.abs(e.clientY - zustand.startY) > 4
        ) {
          zustand.bewegt = true;
        }
      }

      const dauerMinuten =
        zustand.modus === "neu"
          ? zustand.dauerMinuten
          : zustand.block.endMinuten - zustand.block.startMinuten;
      const start = begrenze(
        pos.minuten,
        GRID_START_MINUTEN,
        GRID_END_MINUTEN - dauerMinuten
      );
      const naechste: Vorschau = {
        wochentag: pos.wochentag,
        startMinuten: start,
        endMinuten: start + dauerMinuten,
      };
      vorschauRef.current = naechste;
      setVorschau(naechste);
    }

    function onUp() {
      const zustand = dragZustand!;
      const v = vorschauRef.current;
      setDragZustand(null);
      setVorschau(null);
      vorschauRef.current = null;
      if (!v) return;

      if (zustand.modus === "neu") {
        const fd = new FormData();
        fd.set("mannschaftId", zustand.mannschaftId);
        fd.set("halleId", halleId);
        fd.set("wochentag", String(v.wochentag));
        fd.set("startMinuten", String(v.startMinuten));
        fd.set("endMinuten", String(v.endMinuten));
        fd.set("farbe", zustand.farbe);
        startTransition(() => {
          trainingszeitAnlegen(fd);
        });
        return;
      }

      if (zustand.modus === "verschieben") {
        if (!zustand.bewegt) {
          onBlockClick(zustand.block);
          return;
        }
        const fd = new FormData();
        fd.set("id", zustand.block.id);
        fd.set("wochentag", String(v.wochentag));
        fd.set("startMinuten", String(v.startMinuten));
        fd.set("endMinuten", String(v.endMinuten));
        startTransition(() => {
          trainingszeitVerschieben(fd);
        });
        return;
      }

      // resize
      const fd = new FormData();
      fd.set("id", zustand.block.id);
      fd.set("wochentag", String(zustand.block.wochentag));
      fd.set("startMinuten", String(zustand.block.startMinuten));
      fd.set("endMinuten", String(v.endMinuten));
      startTransition(() => {
        trainingszeitVerschieben(fd);
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragZustand]);

  const mannschaftLabelZuId = new Map(mannschaften.map((m) => [m.id, m.label]));
  const bloeckeProTag: TrainingszeitEintrag[][] = Array.from({ length: 7 }, () => []);
  for (const t of trainingszeiten) {
    if (dragZustand && "block" in dragZustand && dragZustand.block.id === t.id) continue;
    bloeckeProTag[t.wochentag]?.push(t);
  }

  const stunden = Array.from(
    { length: (GRID_END_MINUTEN - GRID_START_MINUTEN) / 60 + 1 },
    (_, i) => GRID_START_MINUTEN / 60 + i
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {mannschaften.map((m) => (
          <div
            key={m.id}
            onPointerDown={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setDragZustand({
                modus: "neu",
                mannschaftId: m.id,
                mannschaftLabel: m.label,
                farbe: standardFarbeFuerMannschaft(m.id),
                dauerMinuten: 60,
              });
            }}
            className="cursor-grab touch-none rounded-full border px-3 py-1 text-xs font-medium select-none active:cursor-grabbing"
            style={{ borderColor: standardFarbeFuerMannschaft(m.id) }}
          >
            {m.label}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Mannschaft auf einen Wochentag ziehen, um ein Training anzulegen — an
        der unteren Kante eines Trainings ziehen, um die Dauer zu ändern.
      </p>

      <div className="flex overflow-x-auto rounded-lg border">
        <div className="flex min-w-max flex-1 flex-col">
          <div className="flex">
            <div className="w-12 shrink-0" />
            {WOCHENTAGE_LABEL_KURZ.map((label) => (
              <div
                key={label}
                className="w-32 shrink-0 border-b py-1 text-center text-xs font-medium"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="flex">
            <div className="relative w-12 shrink-0" style={{ height: GRID_HOEHE }}>
              {stunden.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                  style={{ top: (h * 60 - GRID_START_MINUTEN) * PX_PRO_MINUTE }}
                >
                  {h}:00
                </div>
              ))}
            </div>
            {Array.from({ length: 7 }, (_, tag) => tag).map((tag) => {
              const platziert = platziereZeitbloecke(bloeckeProTag[tag]);
              return (
                <div
                  key={tag}
                  ref={(el) => {
                    spaltenRefs.current[tag] = el;
                  }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const start = begrenze(
                      rundeAufRaster((e.clientY - rect.top) / PX_PRO_MINUTE) +
                        GRID_START_MINUTEN,
                      GRID_START_MINUTEN,
                      GRID_END_MINUTEN - 60
                    );
                    onSlotClick({
                      halleId,
                      wochentag: tag,
                      startMinuten: start,
                      endMinuten: start + 60,
                    });
                  }}
                  className="relative w-32 shrink-0 border-l"
                  style={{ height: GRID_HOEHE }}
                >
                  {stunden.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-dashed"
                      style={{ top: (h * 60 - GRID_START_MINUTEN) * PX_PRO_MINUTE }}
                    />
                  ))}

                  {platziert.map((block) => (
                    <div
                      key={block.id}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setDragZustand({
                          modus: "verschieben",
                          block,
                          startX: e.clientX,
                          startY: e.clientY,
                          bewegt: false,
                        });
                      }}
                      className="absolute flex touch-none cursor-grab flex-col overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight text-white shadow-sm active:cursor-grabbing"
                      style={{
                        top: (block.startMinuten - GRID_START_MINUTEN) * PX_PRO_MINUTE,
                        height:
                          (block.endMinuten - block.startMinuten) * PX_PRO_MINUTE,
                        left: `${(block.lane / block.lanesGesamt) * 100}%`,
                        width: `${100 / block.lanesGesamt}%`,
                        backgroundColor: block.farbe,
                      }}
                    >
                      <span
                        className="truncate font-medium"
                        title={mannschaftLabelZuId.get(block.mannschaftId) ?? "?"}
                      >
                        {mannschaftLabelZuId.get(block.mannschaftId) ?? "?"}
                      </span>
                      <span className="truncate opacity-90">
                        {formatUhrzeit(block.startMinuten)}–
                        {formatUhrzeit(block.endMinuten)}
                      </span>
                      {block.abteilNummer != null && (
                        <span className="truncate opacity-90">
                          {abteilLabel(halle, block.abteilNummer)}
                        </span>
                      )}
                      <div
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(
                            e.pointerId
                          );
                          setDragZustand({ modus: "resize", block });
                        }}
                        className="absolute inset-x-0 bottom-0 flex h-3 touch-none cursor-ns-resize items-center justify-center"
                      >
                        <GripHorizontalIcon className="size-3 opacity-70" />
                      </div>
                    </div>
                  ))}

                  {vorschau &&
                    vorschau.wochentag === tag &&
                    (() => {
                      const farbe =
                        dragZustand?.modus === "neu"
                          ? dragZustand.farbe
                          : dragZustand && "block" in dragZustand
                            ? dragZustand.block.farbe
                            : "#3b82f6";
                      const label =
                        dragZustand?.modus === "neu"
                          ? dragZustand.mannschaftLabel
                          : dragZustand && "block" in dragZustand
                            ? mannschaftLabelZuId.get(dragZustand.block.mannschaftId)
                            : null;
                      return (
                        <div
                          className="pointer-events-none absolute inset-x-0 flex flex-col overflow-hidden rounded-md border-2 border-dashed px-1.5 py-1 text-[11px] leading-tight font-medium opacity-80"
                          style={{
                            top:
                              (vorschau.startMinuten - GRID_START_MINUTEN) *
                              PX_PRO_MINUTE,
                            height:
                              (vorschau.endMinuten - vorschau.startMinuten) *
                              PX_PRO_MINUTE,
                            borderColor: farbe,
                            backgroundColor: `${farbe}33`,
                          }}
                        >
                          {label && <span className="truncate">{label}</span>}
                        </div>
                      );
                    })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
