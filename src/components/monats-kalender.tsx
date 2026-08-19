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
import {
  formatMonatJahr,
  formatWochentagDatum,
  toDatetimeLocalWert,
} from "@/lib/format";

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
  // "Herren 1 (MJC)" o.ä. — siehe formatMannschaft in lib/dashboard.ts.
  mannschaftLabel?: string | null;
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
  // Default true: die anderen Aufrufstellen (z.B. /profil "Mein Kalender")
  // übergeben ohnehin keine zuordenbarePersonen/mannschaftsListe, die
  // schreibenden Formulare bleiben dort also unabhängig davon unsichtbar —
  // nur /admin/kalender setzt das explizit auf istAdmin (siehe "Admin, nur
  // lesend" in db/schema.ts).
  schreibzugriff = true,
}: {
  jahr: number;
  monatNull: number;
  eintraegeProTag: Map<string, KalenderEintrag[]>;
  mehrtaegigeEintraege?: TurnierBalkenBearbeitbar[];
  mannschaftsListe?: { id: string; name: string; altersklasse?: string | null }[];
  trainerListe?: { userId: string; name: string | null; email: string }[];
  zuordenbarePersonen?: ZuordenbarePerson[];
  basisPfad: string;
  schreibzugriff?: boolean;
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

  // Gemeinsamer Modal-Inhalt für einen Turnier-Balken, unabhängig davon, ob
  // der Auslöser die Grid-Leiste (Desktop) oder die Agenda-Zeile (Mobile,
  // siehe unten) ist — idPrefix hält die Formular-Feld-IDs eindeutig, falls
  // derselbe Balken (unsichtbar) in beiden Darstellungen im DOM landet.
  function balkenDialogInhalt(b: TurnierBalkenBearbeitbar, idPrefix: string) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{b.label}</DialogTitle>
          <DialogDescription>Turnier</DialogDescription>
        </DialogHeader>
        {schreibzugriff ? (
          <form action={updateTerminInline} className="flex flex-col gap-3">
            <input type="hidden" name="terminId" value={b.id} />
            <input type="hidden" name="typ" value="turnier" />
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-start-${b.id}`} className="text-xs">
                  Beginn
                </Label>
                <Input
                  id={`${idPrefix}-start-${b.id}`}
                  name="start"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalWert(b.start)}
                  required
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-ende-${b.id}`} className="text-xs">
                  Ende
                </Label>
                <Input
                  id={`${idPrefix}-ende-${b.id}`}
                  name="ende"
                  type="datetime-local"
                  defaultValue={b.ende ? toDatetimeLocalWert(b.ende) : ""}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-titel-${b.id}`} className="text-xs">
                Titel
              </Label>
              <Input
                id={`${idPrefix}-titel-${b.id}`}
                name="beschreibung"
                defaultValue={b.label}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-ort-${b.id}`} className="text-xs">
                Ort
              </Label>
              <Input
                id={`${idPrefix}-ort-${b.id}`}
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
        ) : (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>
              {b.start.toLocaleDateString("de-DE")}
              {b.ende ? ` – ${b.ende.toLocaleDateString("de-DE")}` : ""}
            </p>
            {b.ort && <p>{b.ort}</p>}
          </div>
        )}
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
      </>
    );
  }

  // Gemeinsamer Modal-Inhalt für einen einzelnen Termin-Eintrag, ebenfalls
  // sowohl vom Grid- als auch vom Agenda-Auslöser genutzt. Anders als beim
  // Turnier-Balken gibt es hier keine expliziten Feld-IDs, die kollidieren
  // könnten (LabeledSelect erzeugt seine IDs intern), daher kein idPrefix
  // nötig.
  function eintragDialogInhalt(e: KalenderEintrag) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{e.label}</DialogTitle>
          <DialogDescription>
            {e.typLabel}
            {e.zeit ? ` · ${e.zeit} Uhr` : ""}
            {e.ort ? ` · ${e.ort}` : ""}
            {e.mannschaftLabel ? ` · ${e.mannschaftLabel}` : ""}
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
                  {schreibzugriff && e.zuordenbar && !d.id.startsWith("ics-") && (
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
          {schreibzugriff && e.zuordenbar &&
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
      </>
    );
  }

  // Agenda-Ansicht für Mobile (siehe unten): jeder Tag des Monats mit
  // mindestens einem Balken oder Termin, jeweils mit vollbreiten statt
  // winzig-schmalen Zeilen — kein horizontales Scrollen und deutlich
  // größere Touch-Targets als im Gitter.
  const heuteKey = tagKey(heute);
  const tageMitInhalt = wochen
    .flat()
    .filter((tag) => tag.imMonat)
    .map((tag) => {
      const key = tagKey(tag.datum);
      return {
        tag,
        key,
        // Tageweise statt uhrzeitgenau (Termine tragen in der Agenda keine
        // rohe Uhrzeit als Date, nur den formatierten String) — reicht als
        // "Minimum"-Abgrenzung völlig aus und behandelt einen bereits
        // gelaufenen Termin von heute bewusst noch nicht als vergangen.
        istVergangen: key < heuteKey,
        balkenHeute: mehrtaegigeEintraege.filter(
          (b) => b.startTag <= key && key <= b.endTag
        ),
        eintraege: eintraegeProTag.get(key) ?? [],
      };
    })
    .filter(({ balkenHeute, eintraege }) => balkenHeute.length > 0 || eintraege.length > 0);

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

      {/* Ab md aufwärts das klassische Monatsgitter — auf dem Handy waren die
          Zellen darin sowohl zum horizontalen Scrollen als auch (bei Text ab
          0.7rem) kaum noch treffsicher antippbar. Darunter (siehe Agenda
          weiter unten) stattdessen eine vollbreite Tagesliste. */}
      <div className="hidden overflow-x-auto md:block">
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
                  // sobald die übrigen Zeilen (Turnier-Balken-Lanes + Termin-
                  // Zeile) den Gesamtbedarf schon allein decken. Ergebnis:
                  // sonst kollabiert die Datumszeile auf ~0 Höhe und die
                  // Tageszahl verschwindet hinter dem Balken.
                  //
                  // Die letzte Zeile (Termine des Tages) dagegen bewusst
                  // "auto" statt "1fr": deren Inhalt spannt NICHT über
                  // mehrere Zeilen (anders als die Hintergrund-Zelle oben),
                  // zählt für die Größenberechnung dieser einen Zeile also
                  // ganz normal mit. "1fr" hätte hier ohne definierte
                  // Container-Höhe kaum Platz bekommen — an Tagen mit
                  // mehreren Terminen liefen die Einträge dadurch übereinander
                  // statt die Zelle wachsen zu lassen. Höhe ist hier bewusst
                  // nicht begrenzt, ein langer Tag darf die ganze Woche höher
                  // machen.
                  gridTemplateRows: `1.4rem repeat(${maxLanesGesamt}, 1.1rem) auto`,
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
                    <DialogContent>{balkenDialogInhalt(b, "g")}</DialogContent>
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
                                    : "bg-destructive"
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
                          <DialogContent>{eintragDialogInhalt(e)}</DialogContent>
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

      {/* Unter md: Agenda statt Gitter, siehe tageMitInhalt oben. */}
      <div className="flex flex-col gap-4 md:hidden">
        {tageMitInhalt.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine Termine in diesem Monat.
          </p>
        )}
        {tageMitInhalt.map(({ tag, key, istVergangen, balkenHeute, eintraege }) => (
          <div
            key={key}
            className={`flex flex-col gap-1.5 ${istVergangen ? "opacity-50" : ""}`}
          >
            <p
              className={`flex items-center gap-2 text-sm font-medium capitalize ${
                tag.heute ? "text-primary" : ""
              }`}
            >
              {formatWochentagDatum(tag.datum)}
              {tag.heute && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] font-normal text-primary-foreground">
                  Heute
                </span>
              )}
            </p>
            <div className="flex flex-col gap-1.5 rounded-lg border bg-background p-1.5">
              {balkenHeute.map((b) => (
                <Dialog key={b.id}>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="w-full truncate rounded-md bg-primary px-3 py-2.5 text-left text-sm font-medium text-primary-foreground active:bg-primary/90"
                      />
                    }
                  >
                    {b.label}
                  </DialogTrigger>
                  <DialogContent>{balkenDialogInhalt(b, "m")}</DialogContent>
                </Dialog>
              ))}
              {eintraege.map((e) => (
                <Dialog key={e.id}>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md bg-secondary px-3 py-2.5 text-left text-sm text-secondary-foreground active:bg-secondary/70"
                      />
                    }
                  >
                    {e.besetzung && !e.ergebnis && (
                      <span
                        className={`inline-block size-2 shrink-0 rounded-full ${
                          e.besetzung === "vollstaendig"
                            ? "bg-emerald-500"
                            : "bg-destructive"
                        }`}
                      />
                    )}
                    {e.zeit && <span className="shrink-0 font-medium">{e.zeit}</span>}
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    {e.ergebnis && (
                      <span className="shrink-0 font-medium">{e.ergebnis}</span>
                    )}
                  </DialogTrigger>
                  <DialogContent>{eintragDialogInhalt(e)}</DialogContent>
                </Dialog>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
