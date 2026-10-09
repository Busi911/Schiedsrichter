"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/labeled-select";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

export type EintragbarerTermin = {
  id: string;
  zeit: string;
  // Kalendertag (Europe/Berlin, siehe tagKey in lib/kalender.ts) — dient nur
  // dem Gruppieren hier (Vergleich auf Gleichheit), nicht der Anzeige.
  tag: string;
  tagLabel: string;
  typLabel: string;
  ort: string | null;
  beschreibung: string | null;
  vollstaendig: boolean;
  eintragbar: boolean;
  // Werte aus rolleOptionen, für die bei DIESEM Termin noch Bedarf besteht
  // (siehe offeneRollen-Berechnung in den beiden page.tsx) — schränkt unten
  // die Rollen-Auswahl auf die Schnittmenge über alle ausgewählten Termine
  // ein, damit niemand eine für die aktuelle Auswahl bereits volle Rolle
  // wählen kann.
  offeneRollen: string[];
  zuordnungen: { id: string; label: string }[];
};

export type MehrfachEintragErgebnis = {
  eingetragen: number;
  gesamt: number;
  // Mehrere Fehler mit " | " getrennt, analog zu den Import-/nuLiga-
  // Ergebnissen in admin/funktionstraeger und admin/einstellungen.
  fehler: string | null;
  // Nicht blockierende Hinweise (z.B. Ordner-Doppelrolle über ORDNER_ROLLEN
  // hinweg, siehe pruefeKeineOrdnerDoppelrolle in lib/ordnerwart.ts) —
  // anders als fehler kein abgelehnter Termin, nur ein Hinweis zu einem
  // trotzdem erfolgreich eingetragenen. Ebenfalls mit " | " getrennt.
  warnung?: string | null;
};

// Ersetzt die frühere Einzel-Eintragung (ein Formular je Termin) — Checkbox
// pro noch offenem Termin, EIN gemeinsames Formular für Name/Rolle trägt
// sich dann für alle ausgewählten Termine auf einmal ein. Rollenneutral
// (rolleOptionen/submitAction als Props) — genutzt sowohl von
// /zeitnehmer-eintragen (Zeitnehmer/Sekretär) als auch /ordner-eintragen
// (Ordner/Kioskdienst/Kassierer), gleiches Mehrfachauswahl-Muster wie in
// mannschaften-tabelle.tsx. Selektionszustand braucht Client-State, daher
// hier statt direkt in der jeweiligen (Server Component) page.tsx.
//
// Drei Absende-Varianten, gesteuert über eingeloggtAls/zeigeEmailFeld (siehe
// dort): anonym per Name, anonym per Name+E-Mail (legt bei Bedarf ein
// zunächst inaktives Konto an), oder mit erkannter Session (Name/E-Mail
// komplett ausgeblendet, Identität kommt aus der Session).
export function TerminMehrfachAuswahl({
  token,
  termine,
  rolleOptionen,
  submitAction,
  eingeloggtAls,
  zeigeEmailFeld,
}: {
  token: string;
  termine: EintragbarerTermin[];
  rolleOptionen: { value: string; label: string }[];
  submitAction: (formData: FormData) => Promise<MehrfachEintragErgebnis>;
  // Gesetzt, wenn die Seite eine passende, eingeloggte Session erkannt hat
  // (siehe auth() in den beiden page.tsx) — blendet Name/E-Mail-Feld
  // komplett aus, die Identität kommt dann serverseitig aus der Session
  // statt aus dem Formular (siehe *SelbstEintragenMehrfachEingeloggt in den
  // jeweiligen actions.ts).
  eingeloggtAls?: string;
  // Zusätzliches, OPTIONALES E-Mail-Feld im anonymen Formular — wird eine
  // E-Mail angegeben, legt submitAction dafür direkt ein Konto (+ zunächst
  // inaktive Rolle, bis ein Wart sie freischaltet) an, statt nur einen
  // freien Namenstext zu speichern. Nur relevant, wenn eingeloggtAls NICHT
  // gesetzt ist.
  zeigeEmailFeld?: boolean;
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  // Tages-Überschriften nur, wenn die Liste tatsächlich mehrere Kalendertage
  // umfasst (z.B. bei "Alle" mit vielen Mannschaften) — bei nur einem Tag
  // wäre eine einzelne, immer gleiche Überschrift nur Rauschen (siehe
  // gleiches Prinzip in turnier-spielplan.tsx).
  // "Offene zuerst" zeigt die Termine mit noch freier Besetzung oben (stabil,
  // also innerhalb der Gruppen weiter nach Datum) — bei vielen Terminen
  // (z.B. "Alle" Mannschaften) sonst mühsam, die noch offenen zwischen den
  // bereits vollständigen zu suchen. In dieser Ansicht gibt es keine
  // Tages-Überschriften, da die Reihenfolge nicht mehr chronologisch ist
  // (das Datum steht in jeder Karte selbst).
  const [sortierung, setSortierung] = useState<"datum" | "offen">("offen");
  const anzeigeTermine =
    sortierung === "offen"
      ? [...termine].sort((a, b) => Number(a.vollstaendig) - Number(b.vollstaendig))
      : termine;
  const mehrtaegig =
    sortierung === "datum" && new Set(termine.map((t) => t.tag)).size > 1;

  // Schnittmenge der noch offenen Rollen über alle aktuell ausgewählten
  // Termine — bei nur einem Termin einfach dessen eigene offeneRollen. Das
  // gemeinsame Rolle-Dropdown gilt für ALLE ausgewählten Termine auf einmal
  // (ein Absenden, eine Rolle), darf also nur Rollen anbieten, die bei
  // jedem einzelnen noch frei sind — sonst ließe sich eine bereits besetzte
  // Rolle auswählen, für die die Eintragung ohnehin abgelehnt würde.
  const ausgewaehlteTermine = termine.filter((t) => ausgewaehlt.has(t.id));
  const gemeinsameOffeneRollen = ausgewaehlteTermine.reduce<Set<string>>(
    (schnittmenge, t, i) =>
      i === 0
        ? new Set(t.offeneRollen)
        : new Set([...schnittmenge].filter((r) => t.offeneRollen.includes(r))),
    new Set()
  );
  const rolleOptionenGefiltert = rolleOptionen.filter((o) =>
    gemeinsameOffeneRollen.has(o.value)
  );

  const [status, submitActionState] = useActionState(
    (_bisher: MehrfachEintragErgebnis | null, formData: FormData) =>
      submitAction(formData),
    null
  );
  // State während des Renderns anpassen statt in einem Effect (siehe
  // https://react.dev/learn/you-might-not-need-an-effect) — vermeidet einen
  // zusätzlichen Render-Umweg und die zugehörige Lint-Warnung. Die Auswahl
  // wird nur zurückgesetzt, wenn mindestens ein Termin tatsächlich
  // eingetragen wurde, nicht bei einem kompletten Fehlschlag (z.B. alle
  // ausgewählten Termine bereits voll oder Person bereits eingetragen).
  const [verarbeiteterStatus, setVerarbeiteterStatus] = useState(status);
  if (status !== verarbeiteterStatus) {
    setVerarbeiteterStatus(status);
    if (status && status.eingetragen > 0) {
      setAusgewaehlt(new Set());
    }
  }

  // Rückmeldung nach dem Absenden (Erfolg ODER Fehler) in den sichtbaren Bereich holen — das Formular klebt unten, die Meldung steht oben.
  const rueckmeldungRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status) rueckmeldungRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [status]);

  function toggle(id: string) {
    setAusgewaehlt((bisherige) => {
      const naechste = new Set(bisherige);
      if (naechste.has(id)) naechste.delete(id);
      else naechste.add(id);
      return naechste;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {status && status.eingetragen > 0 && (
        <div ref={rueckmeldungRef}>
          <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2Icon />
            <AlertDescription className="text-base font-medium text-emerald-800 dark:text-emerald-300">
              {status.eingetragen === status.gesamt
                ? status.gesamt === 1
                  ? "Erledigt: Der Termin ist eingetragen."
                  : `Erledigt: Alle ${status.gesamt} Termine sind eingetragen.`
                : `${status.eingetragen} von ${status.gesamt} Terminen eingetragen.`}{" "}
              Danke! Die Einträge stehen jetzt an den Terminen.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {// Außerhalb des Formulars, da das Formular nach einem Teilerfolg
      // (mindestens ein Termin eingetragen) ausgeblendet wird, sobald die
      // Auswahl zurückgesetzt ist — die Fehlermeldung zu den restlichen,
      // fehlgeschlagenen Terminen soll trotzdem sichtbar bleiben.
      status?.fehler && (
        <div ref={status.eingetragen > 0 ? undefined : rueckmeldungRef}>
          <Alert variant="destructive">
            <AlertDescription className="text-base">
              {status.fehler.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {status?.warnung && (
        <Alert>
          <AlertDescription className="text-base">
            {status.warnung.split(" | ").map((w) => (
              <p key={w}>{w}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-base text-muted-foreground">Tippt einen Termin an, um ihn auszuwählen — mehrere gleichzeitig sind möglich.</p>

      <div className="flex w-fit gap-1 rounded-lg border bg-muted p-1">
        <Button
          type="button"
          variant={sortierung === "datum" ? "secondary" : "ghost"}
          className="h-11 px-4 text-base"
          onClick={() => setSortierung("datum")}
        >
          Nach Datum
        </Button>
        <Button
          type="button"
          variant={sortierung === "offen" ? "secondary" : "ghost"}
          className="h-11 px-4 text-base"
          onClick={() => setSortierung("offen")}
        >
          Offene zuerst
        </Button>
      </div>

      {anzeigeTermine.map((t, i) => (
        <div key={t.id} className="flex flex-col gap-3">
          {mehrtaegig && (i === 0 || anzeigeTermine[i - 1].tag !== t.tag) && (
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t.tagLabel}
            </p>
          )}
          <Card
            className={cn(
              "min-w-0",
              // Ganze Karte als Tippfläche statt nur der kleinen Checkbox —
              // auf dem Handy (Hauptnutzung dieser Seite, z.B. während eines
              // Turniers) deutlich leichter zu treffen.
              t.eintragbar && "cursor-pointer select-none transition active:scale-[0.99]",
              ausgewaehlt.has(t.id) && "bg-primary/5 ring-2 ring-primary"
            )}
            onClick={t.eintragbar ? () => toggle(t.id) : undefined}
          >
            <CardContent className="flex flex-col gap-3 text-base">
              <div className="flex flex-wrap items-center gap-2">
                {t.eintragbar && (
                  <input
                    type="checkbox"
                    aria-label={`${t.zeit} auswählen`}
                    className="size-6 shrink-0 accent-primary"
                    checked={ausgewaehlt.has(t.id)}
                    onChange={() => toggle(t.id)}
                    // Klick nicht zusätzlich zur Karte durchbubbeln lassen,
                    // sonst würde ein Klick direkt auf die Checkbox den
                    // Zustand zweimal umschalten (einmal hier, einmal über
                    // onClick der Karte).
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span className="text-lg font-semibold">{t.zeit}</span>
                <Badge variant="outline">{t.typLabel}</Badge>
                <Badge variant={t.vollstaendig ? "secondary" : "outline"}>
                  {t.vollstaendig ? "Besetzung vollständig" : "Besetzung offen"}
                </Badge>
                {t.ort && <span className="text-muted-foreground">{t.ort}</span>}
              </div>
              {t.beschreibung && (
                <p className="text-muted-foreground">{t.beschreibung}</p>
              )}
              {(t.zuordnungen.length > 0 || t.offeneRollen.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {t.zuordnungen.map((z) => (
                    <Badge key={z.id} variant="secondary">
                      {z.label}
                    </Badge>
                  ))}
                  {// Direkt sichtbar statt nur indirekt über die Rollen-Auswahl
                  // im Formular oben (die nur bei ausgewählten Terminen und
                  // nur als Schnittmenge über alle Auswahl sichtbar ist) —
                  // sonst war eine noch offene Rolle nur am generischen
                  // "Besetzung offen"-Badge erkennbar, nicht WELCHE Rolle.
                  t.offeneRollen.map((rolle) => (
                    <Badge key={rolle} variant="outline">
                      {rolleOptionen.find((o) => o.value === rolle)?.label ?? rolle}:
                      offen
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
      {ausgewaehlt.size > 0 && (
        // Klebt am unteren Bildschirmrand, solange die Liste darüber noch im
        // Bild ist — bei vielen ausgewählten Terminen muss man sonst zum
        // Absenden wieder ganz nach oben scrollen (Hauptnutzung: Handy).
        // Steht deshalb NACH der Liste (sticky bottom bezieht sich auf den
        // Container; am Listenende sitzt es einfach an seiner normalen Stelle).
        <form
          action={submitActionState}
          className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-lg"
        >
          <input type="hidden" name="token" value={token} />
          {[...ausgewaehlt].map((id) => (
            <input key={id} type="hidden" name="terminIds" value={id} />
          ))}
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold">
              {ausgewaehlt.size} {ausgewaehlt.size === 1 ? "Termin" : "Termine"}{" "}
              ausgewählt
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3 text-sm"
              onClick={() => setAusgewaehlt(new Set())}
            >
              Zurücksetzen
            </Button>
          </div>
          {rolleOptionenGefiltert.length === 0 ? (
            // Kein gemeinsames Absenden möglich, wenn die ausgewählten
            // Termine keine gemeinsam noch offene Rolle mehr haben (z.B.
            // einer braucht nur noch einen Zeitnehmer, ein anderer nur noch
            // einen Sekretär) — Hinweis statt einem Rollen-Dropdown ohne
            // Optionen.
            <span className="text-sm text-destructive">
              Für die ausgewählte Kombination gibt es keine gemeinsame offene
              Rolle mehr — bitte Auswahl anpassen oder Termine einzeln
              eintragen.
            </span>
          ) : (
            <>
              {eingeloggtAls ? (
                <span className="text-base">
                  Eintragen als <strong>{eingeloggtAls}</strong>
                </span>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="eintragen-name" className="text-base">
                      Name
                    </Label>
                    <Input id="eintragen-name" name="name" placeholder="Vor- und Nachname" autoComplete="name" required className="h-12 px-3" />
                  </div>
                  {zeigeEmailFeld && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="eintragen-email" className="text-base">
                        E-Mail (optional)
                      </Label>
                      <Input
                        id="eintragen-email"
                        name="email"
                        type="email"
                        placeholder="name@verein.de"
                        autoComplete="email"
                        className="h-12 px-3"
                      />
                      <p className="text-sm text-muted-foreground">Nur nötig, wenn ihr einen eigenen Zugang möchtet.</p>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor="eintragen-rolle" className="text-base">
                    Rolle
                  </Label>
                  <LabeledSelect
                    id="eintragen-rolle"
                    name="rolle"
                    placeholder="Rolle wählen…"
                    options={rolleOptionenGefiltert}
                    triggerClassName="h-12 text-base"
                    required
                  />
                </div>
                <SubmitButton className="h-12 px-6 text-base sm:flex-none" pendingText="Wird eingetragen…">
                  {ausgewaehlt.size === 1 ? "Eintragen" : `Für alle ${ausgewaehlt.size} eintragen`}
                </SubmitButton>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
