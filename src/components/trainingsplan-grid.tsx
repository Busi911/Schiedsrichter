"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { cn } from "@/lib/utils";
import {
  halleAnlegen,
  halleBearbeiten,
  halleLoeschen,
} from "@/app/admin/(dashboard)/trainingsplan/actions";
import { TrainingsplanWoche } from "@/components/trainingsplan-woche";
import {
  SchliesseNachSpeichern,
  TrainingszeitDialog,
  type TrainingszeitEintrag,
} from "@/components/trainingszeit-dialog";
import { AlertTriangleIcon } from "lucide-react";
import {
  ABTEIL_ANZAHL_OPTIONEN,
  abteilLabel,
  findeKonflikte,
  formatUhrzeit,
  type Konflikt,
  type KonfliktArt,
  WOCHENTAGE_LABEL,
  type HalleMitAbteilen,
} from "@/lib/trainingsplan";

type Halle = { id: string; name: string } & HalleMitAbteilen;
type Mannschaft = { id: string; label: string };

type DialogZustand =
  | {
      modus: "neu";
      vorgabe: {
        halleId: string;
        wochentag: number;
        startMinuten: number;
        endMinuten: number;
      };
    }
  | { modus: "bearbeiten"; eintrag: TrainingszeitEintrag };

function NeueHalleDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        + Halle
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Halle anlegen</DialogTitle>
        </DialogHeader>
        <form action={halleAnlegen} className="flex flex-col gap-3">
          <SchliesseNachSpeichern onFertig={() => setOpen(false)} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="halle-name">Name</Label>
            <Input id="halle-name" name="name" required placeholder="z.B. Sporthalle Nord" />
          </div>
          <DialogFooter>
            <SubmitButton pendingText="Wird angelegt…">Anlegen</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ABTEIL_NAMEN_FELDER = [
  "abteil1Name",
  "abteil2Name",
  "abteil3Name",
  "abteil4Name",
] as const;

// Name UND optionale Unterteilung in bis zu 4 Abteile (z.B. per
// Hallentrenn-Vorhang) in einem Dialog — die Anzahl-Auswahl blendet die
// passende Zahl Namensfelder live ein/aus (Client-State), gespeichert wird
// aber erst gemeinsam beim Absenden (siehe halleBearbeiten).
function HalleBearbeitenDialog({ halle }: { halle: Halle }) {
  const [open, setOpen] = useState(false);
  const [abteilAnzahl, setAbteilAnzahl] = useState(halle.abteilAnzahl);
  const abteilNamen = [
    halle.abteil1Name,
    halle.abteil2Name,
    halle.abteil3Name,
    halle.abteil4Name,
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Bearbeiten
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Halle bearbeiten</DialogTitle>
        </DialogHeader>
        <form action={halleBearbeiten} className="flex flex-col gap-3">
          <SchliesseNachSpeichern onFertig={() => setOpen(false)} />
          <input type="hidden" name="halleId" value={halle.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="halle-bearbeiten-name">Name</Label>
            <Input
              id="halle-bearbeiten-name"
              name="name"
              required
              defaultValue={halle.name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="halle-bearbeiten-abteilanzahl">
              Unterteilt in Abteile (z.B. per Hallentrenn-Vorhang)
            </Label>
            <LabeledSelect
              id="halle-bearbeiten-abteilanzahl"
              name="abteilAnzahl"
              defaultValue={String(halle.abteilAnzahl)}
              onValueChange={(value) => setAbteilAnzahl(Number(value))}
              options={ABTEIL_ANZAHL_OPTIONEN.map((n) => ({
                value: String(n),
                label: n === 0 ? "Keine Unterteilung" : `${n} Abteile`,
              }))}
            />
          </div>
          {Array.from({ length: abteilAnzahl }, (_, i) => i + 1).map((n) => (
            <div key={n} className="flex flex-col gap-1.5">
              <Label htmlFor={`halle-bearbeiten-abteil-${n}`}>
                Name Abteil {n} (optional)
              </Label>
              <Input
                id={`halle-bearbeiten-abteil-${n}`}
                name={ABTEIL_NAMEN_FELDER[n - 1]}
                placeholder={`Abteil ${n}`}
                defaultValue={abteilNamen[n - 1] ?? ""}
              />
            </div>
          ))}
          <DialogFooter>
            <SubmitButton pendingText="Wird gespeichert…">Speichern</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Mobile-Alternative zum Wochenraster (siehe Mobile-Optimierung in
// CLAUDE.md, analog zur Agenda-Liste in monats-kalender.tsx) — auf
// schmalen Bildschirmen ist ein dichtes 7-Spalten-Zeitraster mit
// Drag&Drop kaum bedienbar, daher hier stattdessen eine einfache,
// nach Wochentag gruppierte Liste mit Bearbeiten-Button je Eintrag, der
// denselben Dialog wie ein Klick auf einen Block im Desktop-Grid öffnet.
function MobileAgenda({
  trainingszeiten,
  mannschaftLabelZuId,
  halle,
  onBearbeiten,
  konflikte,
}: {
  trainingszeiten: TrainingszeitEintrag[];
  mannschaftLabelZuId: Map<string, string>;
  halle: HalleMitAbteilen;
  onBearbeiten: (eintrag: TrainingszeitEintrag) => void;
  konflikte: Map<string, KonfliktArt>;
}) {
  if (trainingszeiten.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Trainingszeiten in dieser Halle.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {WOCHENTAGE_LABEL.map((label, tag) => {
        const eintraege = trainingszeiten
          .filter((t) => t.wochentag === tag)
          .sort((a, b) => a.startMinuten - b.startMinuten);
        if (eintraege.length === 0) return null;
        return (
          <div key={tag} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </p>
            {eintraege.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onBearbeiten(t)}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-2 rounded-lg border p-2 text-left text-base",
                  konflikte.get(t.id) === "ohne_abteil" && "border-amber-400",
                  konflikte.has(t.id) && konflikte.get(t.id) !== "ohne_abteil" && "border-red-500"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: t.farbe }}
                  />
                  <span className="truncate">
                    {mannschaftLabelZuId.get(t.mannschaftId) ?? "?"}
                    {t.abteilNummer != null && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {abteilLabel(halle, t.abteilNummer)}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  {konflikte.has(t.id) && (
                    <AlertTriangleIcon
                      className={cn("size-4", konflikte.get(t.id) === "ohne_abteil" ? "text-amber-500" : "text-red-600")}
                      aria-label="Konflikt"
                    />
                  )}
                  {formatUhrzeit(t.startMinuten)}–{formatUhrzeit(t.endMinuten)}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Trainingsplan-Ansicht einer Halle nach der anderen (statt aller Hallen auf
// einmal) — sonst müsste jede Spalte gleichzeitig Wochentag UND Halle
// codieren, was auf Mobile ohnehin nicht darstellbar wäre; gleichzeitige
// Belegungen DERSELBEN Halle (geteilte Hallen) zeigt TrainingsplanWoche
// bereits nebeneinander (siehe platziereZeitbloecke).
export function TrainingsplanGrid({
  hallen,
  mannschaften,
  trainingszeiten,
  gridStartMinuten,
  gridEndMinuten,
}: {
  hallen: Halle[];
  mannschaften: Mannschaft[];
  trainingszeiten: TrainingszeitEintrag[];
  // Sichtbares Zeitfenster des Wochenrasters (siehe TrainingsplanWoche),
  // vom Verein unter /admin/trainingsplan einstellbar (siehe
  // vereine.trainingsplanStartMinuten/-EndMinuten) statt fest codiert.
  gridStartMinuten: number;
  gridEndMinuten: number;
}) {
  const [halleAktivId, setHalleAktivId] = useState<string | null>(
    hallen[0]?.id ?? null
  );
  const [dialog, setDialog] = useState<DialogZustand | null>(null);

  // Fällt auf die erste verbleibende Halle zurück, wenn die zuletzt aktive
  // gerade gelöscht wurde (halleAktivId zeigt dann auf eine ID, die nach der
  // Revalidierung nicht mehr in hallen vorkommt) — sonst würde die Seite
  // fälschlich "keine Halle angelegt" zeigen, obwohl noch andere existieren.
  const halleAktiv = hallen.find((h) => h.id === halleAktivId) ?? hallen[0] ?? null;
  const zeitenAktiv = trainingszeiten.filter((t) => t.halleId === halleAktiv?.id);
  const mannschaftLabelZuId = new Map(mannschaften.map((m) => [m.id, m.label]));

  // Konflikte über ALLE Hallen (dieselbe Mannschaft kann nicht zweimal gleichzeitig trainieren), angezeigt werden die der aktiven Halle.
  const abteileJeHalle = new Map(hallen.map((h) => [h.id, h.abteilAnzahl]));
  const alleKonflikte = findeKonflikte(trainingszeiten, abteileJeHalle);
  const konflikteAktiv = alleKonflikte.filter((k) => {
    const idsAktiv = new Set(zeitenAktiv.map((t) => t.id));
    return idsAktiv.has(k.a) || idsAktiv.has(k.b);
  });
  const konfliktArtJeId = new Map<string, KonfliktArt>();
  for (const k of konflikteAktiv) {
    for (const id of [k.a, k.b]) {
      // "doppelt"/"abteil" (rot) gehen vor "ohne_abteil" (gelb)
      if (konfliktArtJeId.get(id) !== "doppelt" && konfliktArtJeId.get(id) !== "abteil") konfliktArtJeId.set(id, k.art);
    }
  }
  const eintragNachId = new Map(trainingszeiten.map((t) => [t.id, t]));
  const konfliktText = (k: Konflikt) => {
    const a = eintragNachId.get(k.a);
    const b = eintragNachId.get(k.b);
    const wer = `${mannschaftLabelZuId.get(a?.mannschaftId ?? "") ?? "?"} und ${mannschaftLabelZuId.get(b?.mannschaftId ?? "") ?? "?"}`;
    const wann = `${WOCHENTAGE_LABEL[k.wochentag]} ${formatUhrzeit(k.von)}–${formatUhrzeit(k.bis)}`;
    const halle = hallen.find((h) => h.id === k.halleId);
    if (k.art === "doppelt") return `${wann}: ${mannschaftLabelZuId.get(a?.mannschaftId ?? "") ?? "?"} ist zweimal gleichzeitig eingeplant.`;
    if (k.art === "abteil") return `${wann}: ${wer} im selben Abteil${halle && k.abteilNummer ? ` (${abteilLabel(halle, k.abteilNummer)})` : ""}.`;
    return `${wann}: ${wer} — bei mindestens einem fehlt das Abteil (belegt ggf. die ganze Halle).`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {hallen.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setHalleAktivId(h.id)}
            className={cn(
              buttonVariants({
                variant: h.id === halleAktiv?.id ? "secondary" : "outline",
                size: "sm",
              })
            )}
          >
            {h.name}
          </button>
        ))}
        <NeueHalleDialog />
      </div>

      {!halleAktiv && (
        <p className="text-sm text-muted-foreground">
          Noch keine Halle angelegt — mit „+ Halle“ oben starten.
        </p>
      )}

      {halleAktiv && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{halleAktiv.name}</h3>
            <div className="flex gap-1">
              <HalleBearbeitenDialog halle={halleAktiv} />
              <form action={halleLoeschen}>
                <input type="hidden" name="halleId" value={halleAktiv.id} />
                <ConfirmSubmitButton
                  variant="ghost"
                  size="sm"
                  confirmText={`Halle "${halleAktiv.name}" wirklich löschen? Alle Trainingszeiten dieser Halle werden mitgelöscht.`}
                  pendingText="Wird gelöscht…"
                >
                  Löschen
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>

          {konflikteAktiv.length > 0 && (
            <div
              role="alert"
              className={cn(
                "flex gap-2 rounded-lg border p-3 text-sm",
                konflikteAktiv.some((k) => k.art !== "ohne_abteil")
                  ? "border-red-500/50 bg-red-500/10"
                  : "border-amber-400/60 bg-amber-400/10"
              )}
            >
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {konflikteAktiv.length === 1 ? "1 Überschneidung" : `${konflikteAktiv.length} Überschneidungen`} in dieser Halle
                </p>
                <ul className="list-disc pl-4">
                  {konflikteAktiv.map((k) => (
                    <li key={`${k.a}-${k.b}`}>{konfliktText(k)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {mannschaften.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Mannschaften angelegt (siehe /admin/mannschaften).
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <TrainingsplanWoche
                  halleId={halleAktiv.id}
                  halle={halleAktiv}
                  mannschaften={mannschaften}
                  trainingszeiten={zeitenAktiv}
                  gridStartMinuten={gridStartMinuten}
                  gridEndMinuten={gridEndMinuten}
                  onBlockClick={(eintrag) => setDialog({ modus: "bearbeiten", eintrag })}
                  onSlotClick={(vorgabe) => setDialog({ modus: "neu", vorgabe })}
                  konflikte={konfliktArtJeId}
                />
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                <MobileAgenda
                  trainingszeiten={zeitenAktiv}
                  mannschaftLabelZuId={mannschaftLabelZuId}
                  halle={halleAktiv}
                  onBearbeiten={(eintrag) => setDialog({ modus: "bearbeiten", eintrag })}
                  konflikte={konfliktArtJeId}
                />
                <Button
                  variant="outline"
                  className="h-12 text-base"
                  onClick={() =>
                    setDialog({
                      modus: "neu",
                      vorgabe: {
                        halleId: halleAktiv.id,
                        wochentag: 0,
                        startMinuten: 17 * 60,
                        endMinuten: 18 * 60,
                      },
                    })
                  }
                >
                  + Training hinzufügen
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {dialog && (
        <TrainingszeitDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          mannschaften={mannschaften}
          hallen={hallen}
          eintrag={dialog.modus === "bearbeiten" ? dialog.eintrag : undefined}
          vorgabe={dialog.modus === "neu" ? dialog.vorgabe : undefined}
          alleEintraege={trainingszeiten}
        />
      )}
    </div>
  );
}
