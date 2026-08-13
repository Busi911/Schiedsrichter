"use client";

import Link from "next/link";
import {
  monatKey,
  monatsGitter,
  platziereBalken,
  tagKey,
  type TurnierBalken,
} from "@/lib/kalender";
import { updateTerminInline } from "@/app/admin/actions";
import {
  externeZuordnung,
  zuordnen,
  zuordnungEntfernen,
} from "@/app/admin/zuordnung/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { cn } from "@/lib/utils";
import { formatMonatJahr, toDatetimeLocalWert } from "@/lib/format";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Siehe DISCLOSURE_KLASSE in profil/schiedsrichterwart/page.tsx.
const DISCLOSURE_KLASSE = cn(
  buttonVariants({ variant: "outline", size: "xs" }),
  "cursor-pointer list-none [&::-webkit-details-marker]:hidden"
);

const ZUORDENBARE_TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

export type KalenderEintrag = {
  id: string;
  zeit: string;
  label: string;
  typLabel: string;
  // undefined = für diesen Termin-Typ nicht zutreffend (z.B. Turnier-Container).
  // Wird bei vorhandenem ergebnis ignoriert (siehe unten) — ein bereits
  // abgepfiffenes Spiel braucht keinen Besetzungs-Hinweis mehr.
  besetzung?: "vollstaendig" | "offen";
  // Ob im Modal ein "Person zuordnen"-Mini-Formular angeboten wird (siehe
  // zuordenbarePersonen-Prop) — deckt sich mit BESETZUNGSRELEVANTE_TYPEN.
  zuordenbar?: boolean;
  ort?: string | null;
  // id = terminZuordnungen-Id (für "Entfernen"), bei nicht entfernbaren
  // Einträgen (z.B. ICS-Schiedsrichter) ein synthetischer Platzhalter.
  // hinweis = optionaler nuLiga-Abgleichs-Hinweis (siehe
  // schiedsrichterKuerzelPasstZu), als eigene Zeile unter dem Namen statt
  // inline angehängt, damit lange Gespann-Kürzel nicht mit dem Namen
  // zusammenlaufen.
  besetzungsDetails?: { id: string; label: string; hinweis?: string }[];
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

// Balken mit den Feldern, die das Schnell-Bearbeiten-Formular im Modal
// braucht (siehe updateTerminInline in admin/actions.ts) — id/label/href/
// startTag/endTag kommen bereits aus TurnierBalken.
export type TurnierBalkenBearbeitbar = TurnierBalken & {
  start: Date;
  ende: Date | null;
  ort: string | null;
  mannschaftId: string | null;
  turnierVerantwortlicherId: string | null;
};

export type ZuordenbarePerson = {
  userId: string;
  name: string | null;
  email: string;
  typ: string;
};

export function MonatsKalender({
  jahr,
  monatNull,
  eintraegeProTag,
  mehrtaegigeEintraege = [],
  mannschaftsListe = [],
  trainerListe = [],
  zuordenbarePersonen = [],
  basisPfad,
}: {
  jahr: number;
  monatNull: number;
  eintraegeProTag: Map<string, KalenderEintrag[]>;
  mehrtaegigeEintraege?: TurnierBalkenBearbeitbar[];
  mannschaftsListe?: { id: string; name: string; altersklasse?: string | null }[];
  trainerListe?: { userId: string; name: string | null; email: string }[];
  zuordenbarePersonen?: ZuordenbarePerson[];
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

      {/* overflow-x-auto + min-width statt die Zellen auf schmalen Screens
          weiter zusammenzudrücken (Text war bei 0.7rem/truncate schon am
          unteren Rand) — auf dem Handy scrollt man die Woche lieber
          horizontal, als Inhalte nicht mehr lesen zu können. */}
      <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-hidden rounded-lg border bg-border text-xs">
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
                  // Fixe Höhe statt "auto" für die Datumszeile: die
                  // Tageszelle (Hintergrund-Div) spannt "1 / -1" über ALLE
                  // Zeilen dieser Woche — bei einem CSS-Grid-Item, das über
                  // mehrere Zeilen spannt, zählt sein Platzbedarf für die
                  // Größe der einzelnen "auto"-Zeile NICHT verlässlich mit,
                  // sobald die übrigen Zeilen (Turnier-Balken-Lanes + 1fr)
                  // den Gesamtbedarf schon allein decken. Ergebnis: sobald
                  // ein Turnier-Balken läuft, kollabiert die Datumszeile auf
                  // ~0 Höhe und die Tageszahl verschwindet hinter dem Balken.
                  gridTemplateRows: `1.4rem repeat(${maxLanesGesamt}, 1.1rem) 1fr`,
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
                      <form
                        action={updateTerminInline}
                        className="flex flex-col gap-3"
                      >
                        <input type="hidden" name="terminId" value={b.id} />
                        <input type="hidden" name="typ" value="turnier" />
                        <div className="flex gap-2">
                          <div className="flex flex-1 flex-col gap-1.5">
                            <Label htmlFor={`start-${b.id}`} className="text-xs">
                              Beginn
                            </Label>
                            <Input
                              id={`start-${b.id}`}
                              name="start"
                              type="datetime-local"
                              defaultValue={toDatetimeLocalWert(b.start)}
                              required
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5">
                            <Label htmlFor={`ende-${b.id}`} className="text-xs">
                              Ende
                            </Label>
                            <Input
                              id={`ende-${b.id}`}
                              name="ende"
                              type="datetime-local"
                              defaultValue={b.ende ? toDatetimeLocalWert(b.ende) : ""}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`titel-${b.id}`} className="text-xs">
                            Titel
                          </Label>
                          <Input
                            id={`titel-${b.id}`}
                            name="beschreibung"
                            defaultValue={b.label}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`ort-${b.id}`} className="text-xs">
                            Ort
                          </Label>
                          <Input
                            id={`ort-${b.id}`}
                            name="ort"
                            defaultValue={b.ort ?? ""}
                            className="h-8 text-sm"
                          />
                        </div>
                        {mannschaftsListe.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">Mannschaft (optional)</Label>
                            <LabeledSelect
                              name="mannschaftId"
                              placeholder="—"
                              defaultValue={b.mannschaftId ?? undefined}
                              options={mannschaftsListe.map((m) => ({
                                value: m.id,
                                label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
                              }))}
                            />
                          </div>
                        )}
                        {trainerListe.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <Label className="text-xs">
                              Turnierverantwortlicher (optional)
                            </Label>
                            <LabeledSelect
                              name="turnierVerantwortlicherId"
                              placeholder="— (nur Admin verwaltet)"
                              defaultValue={b.turnierVerantwortlicherId ?? undefined}
                              options={trainerListe.map((t) => ({
                                value: t.userId,
                                label: t.name ?? t.email,
                              }))}
                            />
                          </div>
                        )}
                        <Button type="submit" size="sm" className="mt-1">
                          Speichern
                        </Button>
                      </form>
                      {b.href && (
                        <Button
                          size="sm"
                          variant="outline"
                          render={<Link href={b.href} />}
                          nativeButton={false}
                        >
                          Spielplan &amp; mehr
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
                                <ul className="flex flex-col gap-1">
                                  {e.besetzungsDetails.map((d) => (
                                    <li
                                      key={d.id}
                                      className="flex items-start justify-between gap-2 text-muted-foreground"
                                    >
                                      <span className="flex flex-col">
                                        <span>{d.label}</span>
                                        {d.hinweis && (
                                          <span className="text-xs">{d.hinweis}</span>
                                        )}
                                      </span>
                                      {e.zuordenbar && !d.id.startsWith("ics-") && (
                                        <form action={zuordnungEntfernen} className="shrink-0">
                                          <input
                                            type="hidden"
                                            name="zuordnungId"
                                            value={d.id}
                                          />
                                          <ConfirmSubmitButton
                                            confirmText={`${d.label} entfernen?`}
                                            variant="destructive"
                                            size="xs"
                                          >
                                            Entfernen
                                          </ConfirmSubmitButton>
                                        </form>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {e.zuordenbar &&
                                (() => {
                                  const zuordnenForm = (
                                    <div className="flex flex-col gap-2">
                                      {zuordenbarePersonen.length > 0 && (
                                        <form
                                          action={zuordnen}
                                          className="flex items-center gap-2"
                                        >
                                          <input
                                            type="hidden"
                                            name="terminId"
                                            value={e.id}
                                          />
                                          <div className="flex-1">
                                            <LabeledSelect
                                              name="personTyp"
                                              placeholder="Person wählen…"
                                              required
                                              options={zuordenbarePersonen.map((p) => ({
                                                value: `${p.userId}|${p.typ}`,
                                                label: ZUORDENBARE_TYP_LABEL[p.typ] ?? p.typ,
                                                group: p.name ?? p.email,
                                              }))}
                                            />
                                          </div>
                                          <Button type="submit" variant="outline" size="sm">
                                            Zuordnen
                                          </Button>
                                        </form>
                                      )}
                                      {/* Ohne Login (z.B. Gast-Schiri eines
                                          anderen Vereins) — unabhängig von
                                          zuordenbarePersonen immer verfügbar,
                                          siehe externeZuordnung in
                                          admin/zuordnung/actions.ts. Standardmäßig
                                          eingeklappt: nur ein Fallback, richtig
                                          angelegte Personen sollen der
                                          naheliegendere Weg bleiben. */}
                                      <details className="group">
                                        <summary className={DISCLOSURE_KLASSE}>
                                          <span className="group-open:hidden">
                                            Ohne Login zuordnen (Fallback)
                                          </span>
                                          <span className="hidden group-open:inline">
                                            Schließen
                                          </span>
                                        </summary>
                                        <form
                                          action={externeZuordnung}
                                          className="mt-2 flex flex-col gap-2"
                                        >
                                          <input
                                            type="hidden"
                                            name="terminId"
                                            value={e.id}
                                          />
                                          <Input
                                            name="name"
                                            placeholder="Name ohne Login…"
                                            required
                                            className="h-8 w-full"
                                          />
                                          <div className="flex items-center gap-2">
                                            <div className="flex-1">
                                              <LabeledSelect
                                                name="rolle"
                                                placeholder="Rolle…"
                                                required
                                                options={Object.entries(
                                                  ZUORDENBARE_TYP_LABEL
                                                ).map(([value, label]) => ({
                                                  value,
                                                  label,
                                                }))}
                                              />
                                            </div>
                                            <Button type="submit" variant="ghost" size="xs">
                                              Zuordnen
                                            </Button>
                                          </div>
                                        </form>
                                      </details>
                                    </div>
                                  );
                                  // Ein bereits abgepfiffenes Spiel braucht keine
                                  // Zuordnung mehr im Vordergrund — nachträglich
                                  // jemanden einzutragen bleibt möglich, aber
                                  // hinter einem Toggle statt automatisch offen.
                                  if (e.ergebnis) {
                                    return (
                                      <details className="group border-t pt-2">
                                        <summary className="cursor-pointer list-none text-xs text-muted-foreground underline [&::-webkit-details-marker]:hidden">
                                          <span className="group-open:hidden">
                                            Nachträglich zuordnen (optional)
                                          </span>
                                          <span className="hidden group-open:inline">
                                            Schließen
                                          </span>
                                        </summary>
                                        <div className="mt-2">{zuordnenForm}</div>
                                      </details>
                                    );
                                  }
                                  return (
                                    <div className="border-t pt-2">{zuordnenForm}</div>
                                  );
                                })()}
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
    </div>
  );
}
