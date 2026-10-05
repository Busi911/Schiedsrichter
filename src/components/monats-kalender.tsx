"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarIcon, CheckCircle2, Trophy } from "lucide-react";
import {
  monatKey,
  monatsGitter,
  tagKey,
  type TurnierBalken,
} from "@/lib/kalender";
import { jetzt } from "@/lib/monats-gruppierung";
import { updateTerminInline } from "@/app/admin/(dashboard)/actions";
import {
  externeZuordnung,
  zuordnen,
  zuordnungEntfernen,
} from "@/app/admin/(dashboard)/zuordnung/actions";
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
import { DisclosureSummary } from "@/components/disclosure-summary";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { PersonSelect } from "@/components/person-select";
import {
  formatMonatJahr,
  formatWochentagDatum,
  toDatetimeLocalWert,
  ZEITZONE,
} from "@/lib/format";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Für das Monats-<select> in der Desktop-Kopfzeile (siehe unten) — einmalig
// pro Modul statt pro Render berechnet, da unabhängig von Props/State.
const MONATE_LANG = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: ZEITZONE }).format(
    new Date(Date.UTC(2000, i, 1))
  )
);

// Ab wie vielen Terminen an einem Tag im Gitter (Desktop wie Mobile-Punkte)
// eine Kurzfassung statt aller Zeilen gezeigt wird — die vollständige Liste
// steht ohnehin in der Detailspalte/-liste des ausgewählten Tages.
const MAX_SICHTBARE_EINTRAEGE = 3;

const ZUORDENBARE_TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
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
  // funktionstraegerTyp-Werte ("schiedsrichter"/"zeitnehmer"/"sekretaer"), für
  // die dieser Termin bereits die maximale Anzahl an Personen hat (siehe
  // schiriVoll/zeitnehmerVoll/sekretaerVoll in besetzung.ts) — die
  // entsprechenden Optionen im "Person wählen…"-Dropdown werden dafür
  // ausgegraut, weil eine weitere Zuordnung ohnehin abgelehnt würde.
  volleRollen?: string[];
  // Deterministische Mannschaftsfarbe (siehe standardFarbeFuerMannschaft in
  // lib/trainingsplan.ts) — dieselbe Palette wie im Trainingsplan, damit ein
  // Termin auf einen Blick derselben Mannschaft zuzuordnen ist, unabhängig
  // davon, ob er im Trainingsplan oder im Kalender auftaucht. null/undefined
  // (z.B. Turnier ohne Mannschaft, persönlicher ICS-Import) lässt den
  // Farbpunkt einfach weg.
  farbe?: string | null;
  // Bei echten Ligaspielen (Rundenspiel mit pflichtspiel = true) stellt der
  // Verband den Schiedsrichter — der Verein ordnet hier keinen zu (siehe
  // brauchtSchiedsrichterVomVerein in lib/besetzung.ts). Default true (siehe
  // Verwendung unten), da andere Aufrufstellen (z.B. "Mein Kalender") dieses
  // Feld gar nicht erst setzen.
  schiedsrichterZuordnenErlaubt?: boolean;
  ort?: string | null;
  // id = terminZuordnungen-Id (für "Entfernen"), bei nicht entfernbaren
  // Einträgen (z.B. ICS-Schiedsrichter, oder eine noch nicht mit einer
  // eigenen Person verknüpfte nuLiga-/handball.net-Ansetzung) ein
  // synthetischer Platzhalter — dafür entfernbar explizit false, siehe
  // dessen Verwendung unten (kein "Entfernen"-Button für einen Eintrag, der
  // gar keine echte terminZuordnungen-Zeile ist). hinweis = optionaler
  // nuLiga-Abgleichs-Hinweis (siehe schiedsrichterKuerzelPasstZu), als
  // eigene Zeile unter dem Namen statt inline angehängt, damit lange
  // Gespann-Kürzel nicht mit dem Namen zusammenlaufen.
  besetzungsDetails?: {
    id: string;
    label: string;
    hinweis?: string;
    entfernbar?: boolean;
  }[];
  // "Herren 1 (MJC)" o.ä. — siehe formatMannschaft in lib/dashboard.ts.
  mannschaftLabel?: string | null;
  bearbeitenHref?: string;
  // "24:20"-Format, nur gesetzt wenn beide Werte erfasst sind (siehe
  // ergebnisHeim/ergebnisAuswaerts in db/schema.ts).
  ergebnis?: string | null;
};

// Mehrtägiger Balken (z.B. Turnier-Container) — im Gitter nur noch als
// kurzer Hinweis-Chip an jedem betroffenen Tag markiert (siehe
// TAGE_MIT_BALKEN unten), die eigentliche Bearbeiten-Aktion (siehe
// balkenDialogInhalt) läuft über denselben Eintrag in der Detailspalte/
// -liste des ausgewählten Tages wie ein normaler Termin.
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
  const router = useRouter();

  const wochen = monatsGitter(jahr, monatNull);
  const vorherigerMonat =
    monatNull === 0 ? { jahr: jahr - 1, monatNull: 11 } : { jahr, monatNull: monatNull - 1 };
  const naechsterMonat =
    monatNull === 11 ? { jahr: jahr + 1, monatNull: 0 } : { jahr, monatNull: monatNull + 1 };
  const monatsName = formatMonatJahr(jahr, monatNull);
  const heute = jetzt();
  const heuteKey = tagKey(heute);
  const istAktuellerMonat =
    jahr === heute.getFullYear() && monatNull === heute.getMonth();
  // Direktauswahl auf Desktop (siehe Monats-/Jahres-<select> unten) statt
  // nur Vor-/Zurück-Blättern — v.a. bei einem größeren Sprung (z.B. drei
  // Monate voraus) sonst umständlich. Jahresspanne bewusst statisch statt
  // dynamisch aus vorhandenen Terminen berechnet (unnötiger Aufwand für
  // eine Komfortfunktion; ein Jahr zurück/zwei voraus deckt die relevante
  // Spielzeit plus Planungsvorlauf ab).
  const JAHRE = Array.from({ length: 4 }, (_, i) => heute.getFullYear() - 1 + i);

  // Nur echte Tage dieses Monats sind auswählbar — Auffüll-Tage aus dem
  // Vor-/Folgemonat (siehe monatsGitter) haben keine geladenen Termine
  // (eintraegeProTag deckt nur den angezeigten Monat ab, siehe
  // monatsBereich in lib/kalender.ts) und würden in der Detailspalte
  // fälschlich leer bzw. unvollständig wirken.
  const tageDesMonats = wochen.flat().filter((t) => t.imMonat);

  function tagHatInhalt(key: string): boolean {
    return (
      (eintraegeProTag.get(key)?.length ?? 0) > 0 ||
      mehrtaegigeEintraege.some((b) => b.startTag <= key && key <= b.endTag)
    );
  }

  // Vorbelegung der Detailspalte: im aktuellen Monat der heutige Tag, sonst
  // (z.B. nach "Nächster Monat") der erste Tag mit Terminen, damit die
  // Detailspalte nicht einfach leer beim 1. des Monats landet, obwohl der
  // Monat durchaus Termine hat.
  function ermittleStandardTag(): string {
    if (istAktuellerMonat) return heuteKey;
    const ersterMitInhalt = tageDesMonats.find((t) => tagHatInhalt(tagKey(t.datum)));
    return tagKey((ersterMitInhalt ?? tageDesMonats[0]).datum);
  }

  const monatSchluessel = monatKey(jahr, monatNull);
  // Vorbelegung während des Renderns statt in einem Effect angepasst (siehe
  // "Adjusting state when a prop changes" in der React-Doku) — vermeidet
  // einen zusätzlichen Render-Durchlauf nach dem Mount. Nur beim
  // Monatswechsel (vorherigerMonatSchluessel weicht ab) neu vorbelegt: eine
  // Aktion in der Detailspalte (z.B. Zuordnen/Entfernen) lässt
  // eintraegeProTag per Server-Revalidierung neu referenzieren, soll die
  // Auswahl innerhalb desselben Monats aber nicht zurücksetzen.
  const [vorherigerMonatSchluessel, setVorherigerMonatSchluessel] = useState(monatSchluessel);
  const [ausgewaehlterTag, setAusgewaehlterTag] = useState(ermittleStandardTag);
  if (monatSchluessel !== vorherigerMonatSchluessel) {
    setVorherigerMonatSchluessel(monatSchluessel);
    setAusgewaehlterTag(ermittleStandardTag());
  }

  // Gemeinsamer Modal-Inhalt für einen Turnier-Balken — sowohl vom
  // Gitter-Hinweis-Chip als auch aus der Detailspalte/-liste des
  // ausgewählten Tages aufrufbar.
  function balkenDialogInhalt(b: TurnierBalkenBearbeitbar) {
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
            <SubmitButton size="sm" className="mt-1">
              Speichern
            </SubmitButton>
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

  // Gemeinsamer Modal-Inhalt für einen einzelnen Termin-Eintrag, aus der
  // Detailspalte (Desktop) bzw. Detailliste (Mobile) des ausgewählten Tages
  // aufgerufen.
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
                  {schreibzugriff && e.zuordenbar && d.entfernbar !== false && (
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
              // Bei echten Ligaspielen stellt der Verband den
              // Schiedsrichter (siehe Kommentar bei
              // schiedsrichterZuordnenErlaubt oben) — die Rolle dann gar
              // nicht erst als zuordenbar anbieten, sonst könnte der
              // Eindruck entstehen, der Verein müsste hier selbst jemanden
              // benennen.
              const schiriErlaubt = e.schiedsrichterZuordnenErlaubt !== false;
              const auswaehlbarePersonen = schiriErlaubt
                ? zuordenbarePersonen
                : zuordenbarePersonen.filter((p) => p.typ !== "schiedsrichter");
              const auswaehlbareRollen = schiriErlaubt
                ? Object.entries(ZUORDENBARE_TYP_LABEL)
                : Object.entries(ZUORDENBARE_TYP_LABEL).filter(
                    ([value]) => value !== "schiedsrichter"
                  );
              // Sind bereits alle in Frage kommenden Rollen voll (siehe
              // volleRollen oben), gibt es nichts mehr zuzuordnen — weder
              // "Person wählen…" noch der "Ohne Login"-Fallback sollen dann
              // noch erscheinen, sonst wirkt ein vollständig besetztes Spiel
              // (Badge "Besetzung vollständig") trotzdem so, als fehle noch
              // jemand.
              const alleRollenVoll = auswaehlbareRollen.every(
                ([value]) => e.volleRollen?.includes(value) ?? false
              );
              if (alleRollenVoll) return null;
              const zuordnenForm = (
                <div className="flex flex-col gap-2">
                  {auswaehlbarePersonen.length > 0 && (
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
                        <PersonSelect
                          name="personTyp"
                          placeholder="Person wählen…"
                          required
                          options={auswaehlbarePersonen.map((p) => {
                            const rolleVoll = e.volleRollen?.includes(p.typ) ?? false;
                            return {
                              value: `${p.userId}|${p.typ}`,
                              label: ZUORDENBARE_TYP_LABEL[p.typ] ?? p.typ,
                              group: p.name ?? p.email,
                              disabled: rolleVoll,
                              hinweis: rolleVoll ? "bereits besetzt" : undefined,
                            };
                          })}
                        />
                      </div>
                      <SubmitButton variant="outline" size="sm">
                        Zuordnen
                      </SubmitButton>
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
                    <DisclosureSummary>
                      <span className="group-open:hidden">
                        Ohne Login zuordnen (Fallback)
                      </span>
                      <span className="hidden group-open:inline">
                        Schließen
                      </span>
                    </DisclosureSummary>
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
                            options={auswaehlbareRollen.map(([value, label]) => ({
                              value,
                              label,
                              disabled: e.volleRollen?.includes(value) ?? false,
                            }))}
                          />
                        </div>
                        <SubmitButton variant="ghost" size="xs">
                          Zuordnen
                        </SubmitButton>
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

  // Gemeinsamer Inhalt der Detailspalte (Desktop, rechts neben dem Gitter)
  // bzw. Detailliste (Mobile, unter dem kompakten Gitter) für den aktuell
  // ausgewählten Tag — alles, was an diesem Tag stattfindet: Turnier-Balken,
  // die diesen Tag überspannen, zuerst, danach die normalen Termine in
  // Start-Reihenfolge.
  function tagesDetailInhalt(tagDatum: Date, kompakt: boolean) {
    const key = tagKey(tagDatum);
    const balkenHeute = mehrtaegigeEintraege.filter(
      (b) => b.startTag <= key && key <= b.endTag
    );
    const eintraege = eintraegeProTag.get(key) ?? [];
    const anzahl = balkenHeute.length + eintraege.length;

    if (anzahl === 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/10">
            <CalendarIcon className="size-4 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            Keine Termine an diesem Tag.
          </p>
        </div>
      );
    }

    return (
      <div className={`flex flex-col ${kompakt ? "gap-1.5" : "gap-2"}`}>
        {balkenHeute.map((b) => (
          <Dialog key={b.id}>
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-left text-sm font-medium text-primary-foreground hover:bg-primary/90"
                />
              }
            >
              <Trophy className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{b.label}</span>
            </DialogTrigger>
            <DialogContent>{balkenDialogInhalt(b)}</DialogContent>
          </Dialog>
        ))}
        {eintraege.map((e) => (
          <Dialog key={e.id}>
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="flex flex-col gap-1 rounded-lg border p-3 text-left hover:bg-muted/60"
                />
              }
            >
              <span className="flex items-center gap-2">
                {e.farbe && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: e.farbe }}
                  />
                )}
                {e.zeit && <span className="text-sm font-semibold">{e.zeit}</span>}
                {e.ergebnis ? (
                  <span className="ml-auto shrink-0 text-sm font-semibold">
                    {e.ergebnis}
                  </span>
                ) : (
                  e.besetzung && (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        e.besetzung === "vollstaendig"
                          ? "bg-emerald-700 text-white dark:bg-emerald-600"
                          : "bg-red-700 text-white dark:bg-red-600"
                      }`}
                    >
                      {e.besetzung === "vollstaendig" ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <AlertCircle className="size-3" />
                      )}
                      {e.besetzung === "vollstaendig" ? "Vollständig" : "Offen"}
                    </span>
                  )
                )}
              </span>
              <span className="truncate text-sm font-medium">{e.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {e.typLabel}
                {e.ort ? ` · ${e.ort}` : ""}
              </span>
            </DialogTrigger>
            <DialogContent>{eintragDialogInhalt(e)}</DialogContent>
          </Dialog>
        ))}
      </div>
    );
  }

  const ausgewaehltesDatum =
    wochen.flat().find((t) => tagKey(t.datum) === ausgewaehlterTag)?.datum ?? heute;

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
          <p className="font-heading text-lg font-medium capitalize md:hidden">
            {monatsName}
          </p>
          {/* Direktauswahl statt reinem Vor-/Zurück-Blättern — nur ab md,
              auf Mobile bleibt die schlichte Textzeile oben (kein Platz für
              zwei zusätzliche <select>-Felder neben den Blättern-Links,
              siehe Mobile-Optimierung in CLAUDE.md). */}
          <div className="hidden items-center gap-1.5 md:flex">
            <select
              aria-label="Monat"
              value={monatNull}
              onChange={(e) =>
                router.push(
                  `${basisPfad}?monat=${monatKey(jahr, Number(e.target.value))}`
                )
              }
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-sm capitalize outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {MONATE_LANG.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Jahr"
              value={jahr}
              onChange={(e) =>
                router.push(
                  `${basisPfad}?monat=${monatKey(Number(e.target.value), monatNull)}`
                )
              }
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {JAHRE.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
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

      {/* Ab md: Gitter über die volle verfügbare Breite + Detailspalte für
          den ausgewählten Tag daneben. Unter md (siehe weiter unten) ein
          kompaktes Punkt-Gitter mit der Detailliste darunter statt daneben —
          nebeneinander wäre auf Handy-Breite für beides zu schmal. */}
      <div className="hidden md:flex md:items-start md:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="grid grid-cols-7 gap-1.5">
            {WOCHENTAGE.map((w) => (
              <div
                key={w}
                className="pb-0.5 text-center text-xs font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            {wochen.map((woche, wocheIdx) => (
              <div key={wocheIdx} className="grid grid-cols-7 gap-1.5">
                {woche.map((tag) => {
                  const key = tagKey(tag.datum);
                  const eintraege = eintraegeProTag.get(key) ?? [];
                  const balkenHeute = mehrtaegigeEintraege.filter(
                    (b) => b.startTag <= key && key <= b.endTag
                  );
                  const sichtbareEintraege = eintraege.slice(0, MAX_SICHTBARE_EINTRAEGE);
                  const versteckt = eintraege.length - sichtbareEintraege.length;
                  const ausgewaehlt = key === ausgewaehlterTag;
                  return (
                    <button
                      type="button"
                      key={key}
                      disabled={!tag.imMonat}
                      onClick={() => setAusgewaehlterTag(key)}
                      aria-current={tag.heute ? "date" : undefined}
                      aria-pressed={ausgewaehlt}
                      aria-label={formatWochentagDatum(tag.datum)}
                      className={`flex min-h-28 flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                        !tag.imMonat
                          ? "cursor-default border-transparent opacity-40"
                          : ausgewaehlt
                            ? "border-primary bg-secondary"
                            : "border-border bg-background hover:bg-muted/60"
                      }`}
                    >
                      {tag.heute ? (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {tag.datum.getDate()}
                        </span>
                      ) : (
                        <span
                          className={`px-0.5 text-xs ${ausgewaehlt ? "font-semibold text-primary" : "text-muted-foreground"}`}
                        >
                          {tag.datum.getDate()}
                        </span>
                      )}
                      {balkenHeute.map((b) => (
                        <span
                          key={b.id}
                          className="flex items-center gap-1 truncate rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground"
                        >
                          <Trophy className="size-2.5 shrink-0" />
                          <span className="truncate">{b.label}</span>
                        </span>
                      ))}
                      {sichtbareEintraege.map((e) => (
                        <span
                          key={e.id}
                          className="flex items-center gap-1 truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px]"
                        >
                          {e.farbe && (
                            <span
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: e.farbe }}
                            />
                          )}
                          {e.zeit && <span className="shrink-0 font-medium">{e.zeit}</span>}
                          <span className="min-w-0 flex-1 truncate">{e.label}</span>
                          {e.ergebnis ? (
                            <span className="shrink-0 font-medium">{e.ergebnis}</span>
                          ) : (
                            e.besetzung &&
                            (e.besetzung === "vollstaendig" ? (
                              <CheckCircle2 className="size-2.5 shrink-0 text-emerald-700 dark:text-emerald-500" />
                            ) : (
                              <AlertCircle className="size-2.5 shrink-0 text-destructive" />
                            ))
                          )}
                        </span>
                      ))}
                      {versteckt > 0 && (
                        <span className="px-0.5 text-[10.5px] font-medium text-muted-foreground">
                          +{versteckt} weitere
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Detailspalte: alle Termine des ausgewählten Tages */}
        <div className="w-72 shrink-0 rounded-xl border bg-background p-4">
          <div className="mb-3 flex flex-col gap-0.5">
            <p className="text-xs font-medium text-muted-foreground">
              {ausgewaehlterTag === heuteKey ? "Heute" : "Ausgewählter Tag"}
            </p>
            <h2 className="font-heading text-base font-semibold capitalize">
              {formatWochentagDatum(ausgewaehltesDatum)}
            </h2>
          </div>
          {tagesDetailInhalt(ausgewaehltesDatum, false)}
        </div>
      </div>

      {/* Unter md: kompaktes Punkt-Gitter (ein Monat auf einen Blick, wie
          bei Google/Apple Kalender) + Detailliste des ausgewählten Tages
          darunter — bisher zeigte Mobile hier gar kein Gitter, sondern nur
          eine lange Liste aller Tage mit Terminen im Monat. */}
      <div className="flex flex-col gap-4 md:hidden">
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WOCHENTAGE.map((w) => (
            <span key={w} className="text-[10.5px] font-medium text-muted-foreground">
              {w}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {wochen.map((woche, wocheIdx) => (
            <div key={wocheIdx} className="grid grid-cols-7 gap-1">
              {woche.map((tag) => {
                const key = tagKey(tag.datum);
                const eintraege = eintraegeProTag.get(key) ?? [];
                const balkenHeute = mehrtaegigeEintraege.filter(
                  (b) => b.startTag <= key && key <= b.endTag
                );
                const punkte = [
                  ...balkenHeute.map(() => "var(--primary)"),
                  ...eintraege.map((e) => e.farbe ?? "var(--muted-foreground)"),
                ].slice(0, 3);
                const ausgewaehlt = key === ausgewaehlterTag;
                // Heute/künftig mit mindestens einem noch nicht vollständig besetzten Spiel: Warnzeichen am Tag
                // (Symbol statt nur Farbe, damit es auch bei Rot-Grün-Schwäche erkennbar ist).
                const besetzungOffen =
                  key >= heuteKey && eintraege.some((e) => e.besetzung === "offen");
                return (
                  <button
                    type="button"
                    key={key}
                    disabled={!tag.imMonat}
                    onClick={() => setAusgewaehlterTag(key)}
                    aria-current={tag.heute ? "date" : undefined}
                    aria-pressed={ausgewaehlt}
                    aria-label={`${formatWochentagDatum(tag.datum)}${besetzungOffen ? ", Besetzung offen" : ""}`}
                    className={`relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                      !tag.imMonat
                        ? "cursor-default opacity-30"
                        : ausgewaehlt
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`text-[13px] ${tag.heute && !ausgewaehlt ? "font-bold text-primary" : "font-medium"}`}
                    >
                      {tag.datum.getDate()}
                    </span>
                    {besetzungOffen && tag.imMonat && (
                      <AlertCircle
                        aria-hidden
                        className={`absolute top-0.5 right-0.5 size-3 ${ausgewaehlt ? "text-primary-foreground" : "text-destructive"}`}
                      />
                    )}
                    <span className="flex h-1 items-center gap-0.5">
                      {punkte.map((farbe, i) => (
                        <span
                          key={i}
                          className="size-1 rounded-full"
                          style={{
                            backgroundColor: ausgewaehlt ? "currentColor" : farbe,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            {ausgewaehlterTag === heuteKey ? "Heute" : "Ausgewählter Tag"}
          </p>
          <h2 className="font-heading text-base font-semibold capitalize">
            {formatWochentagDatum(ausgewaehltesDatum)}
          </h2>
        </div>
        {tagesDetailInhalt(ausgewaehltesDatum, true)}
      </div>
    </div>
  );
}
