"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Ablauf in zwei Schritten (Handy zuerst): 1. EINMAL oben angeben, wer man ist (Name, optional E-Mail) und in welcher Rolle, 2. beliebig viele
// Termine antippen. Unten klebt nur eine schmale Leiste mit der Anzahl und dem Eintragen-Button — das Formular verdeckt die Liste also nicht.
// Rollenneutral (rolleOptionen/submitAction als Props) — genutzt sowohl von /zeitnehmer-eintragen (Zeitnehmer/Sekretär) als auch
// /ordner-eintragen (Ordner/Kioskdienst/Kassierer). Termine, bei denen die gewählte Rolle schon besetzt ist, sind ausgegraut.
//
// Drei Absende-Varianten, gesteuert über eingeloggtAls/zeigeEmailFeld: anonym per Name, anonym per Name+E-Mail (legt bei Bedarf ein
// zunächst inaktives Konto an), oder mit erkannter Session (Name/E-Mail ausgeblendet, Identität kommt aus der Session).
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
  // Gesetzt, wenn die Seite eine passende, eingeloggte Session erkannt hat — blendet Name/E-Mail komplett aus.
  eingeloggtAls?: string;
  // Zusätzliches, OPTIONALES E-Mail-Feld im anonymen Formular — wird eine E-Mail angegeben, legt submitAction dafür direkt ein Konto
  // (+ zunächst inaktive Rolle, bis ein Wart sie freischaltet) an. Nur relevant, wenn eingeloggtAls NICHT gesetzt ist.
  zeigeEmailFeld?: boolean;
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  // Nur eine Rolle zur Wahl: gleich vorgewählt. Sonst muss man sie bewusst wählen (nicht raten, welche gemeint ist).
  const [rolle, setRolle] = useState(rolleOptionen.length === 1 ? rolleOptionen[0].value : "");
  // "Offene zuerst" zeigt die Termine mit noch freier Besetzung oben (stabil, innerhalb der Gruppen weiter nach Datum); dann gibt es keine
  // Tages-Überschriften (Reihenfolge nicht mehr chronologisch, das Datum steht in jeder Karte).
  const [sortierung, setSortierung] = useState<"datum" | "offen">("offen");
  const anzeigeTermine =
    sortierung === "offen" ? [...termine].sort((a, b) => Number(a.vollstaendig) - Number(b.vollstaendig)) : termine;
  const mehrtaegig = sortierung === "datum" && new Set(termine.map((t) => t.tag)).size > 1;

  // Wählbar: eintragbar UND (noch keine Rolle gewählt ODER die gewählte Rolle ist dort noch frei).
  const waehlbar = (t: EintragbarerTermin) => t.eintragbar && (!rolle || t.offeneRollen.includes(rolle));
  const rolleLabel = rolleOptionen.find((o) => o.value === rolle)?.label;

  const [status, submitActionState] = useActionState(
    (_bisher: MehrfachEintragErgebnis | null, formData: FormData) => submitAction(formData),
    null
  );
  // State während des Renderns anpassen statt in einem Effect (siehe https://react.dev/learn/you-might-not-need-an-effect). Die Auswahl wird
  // nur zurückgesetzt, wenn mindestens ein Termin tatsächlich eingetragen wurde, nicht bei einem kompletten Fehlschlag.
  const [verarbeiteterStatus, setVerarbeiteterStatus] = useState(status);
  if (status !== verarbeiteterStatus) {
    setVerarbeiteterStatus(status);
    if (status && status.eingetragen > 0) setAusgewaehlt(new Set());
  }

  // Wechselt die Rolle, fliegen Termine aus der Auswahl, bei denen sie nicht (mehr) frei ist.
  function waehleRolle(neu: string) {
    setRolle(neu);
    setAusgewaehlt((bisher) => new Set([...bisher].filter((id) => termine.find((t) => t.id === id)?.offeneRollen.includes(neu))));
  }

  // Rückmeldung nach dem Absenden (Erfolg ODER Fehler) in den sichtbaren Bereich holen — die Leiste klebt unten, die Meldung steht oben.
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

  // Was noch fehlt, bevor eingetragen werden kann (Hinweis in der Leiste statt eines toten Buttons).
  const fehlt = !rolle ? "Bitte oben eine Rolle wählen." : !eingeloggtAls && !name.trim() ? "Bitte oben euren Namen eintragen." : null;

  return (
    <form action={submitActionState} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {[...ausgewaehlt].map((id) => (
        <input key={id} type="hidden" name="terminIds" value={id} />
      ))}
      <input type="hidden" name="rolle" value={rolle} />

      <div ref={rueckmeldungRef} className="flex scroll-mt-4 flex-col gap-3 empty:hidden">
        {status && status.eingetragen > 0 && (
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
        )}
        {// Außerhalb der Auswahl, da diese nach einem Teilerfolg zurückgesetzt wird — die Fehlermeldung zu den restlichen,
        // fehlgeschlagenen Terminen soll trotzdem sichtbar bleiben.
        status?.fehler && (
          <Alert variant="destructive">
            <AlertDescription className="text-base">
              {status.fehler.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
            </AlertDescription>
          </Alert>
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
      </div>

      {/* Schritt 1: wer und in welcher Rolle — einmal für alle Termine */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="text-base font-semibold">1. Wer trägt sich ein?</p>
          {eingeloggtAls ? (
            <p className="text-base">
              Eintragen als <strong>{eingeloggtAls}</strong>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="eintragen-name" className="text-base">
                  Name
                </Label>
                <Input
                  id="eintragen-name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vor- und Nachname"
                  autoComplete="name"
                  required
                  className="h-12 px-3"
                />
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
          <div className="flex flex-col gap-1.5">
            <span className="text-base font-medium" id="eintragen-rolle-label">
              Rolle
            </span>
            <div role="radiogroup" aria-labelledby="eintragen-rolle-label" className="flex flex-wrap gap-2">
              {rolleOptionen.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={rolle === o.value}
                  variant={rolle === o.value ? "default" : "outline"}
                  className="h-12 flex-1 px-5 text-base sm:flex-none"
                  onClick={() => waehleRolle(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schritt 2: Termine antippen */}
      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold">2. Termine antippen</p>
        <p className="-mt-2 text-base text-muted-foreground">
          {rolle ? `Tippt die Termine an, bei denen ihr als ${rolleLabel} helft — mehrere gleichzeitig sind möglich.` : "Wählt zuerst oben eine Rolle."}
        </p>

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

        {anzeigeTermine.map((t, i) => {
          const frei = waehlbar(t);
          const belegtFuerRolle = t.eintragbar && !frei; // Termin hat noch Bedarf, aber nicht für die gewählte Rolle
          return (
            <div key={t.id} className="flex flex-col gap-3">
              {mehrtaegig && (i === 0 || anzeigeTermine[i - 1].tag !== t.tag) && (
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.tagLabel}</p>
              )}
              <Card
                className={cn(
                  "min-w-0",
                  // Ganze Karte als Tippfläche statt nur der Checkbox — auf dem Handy deutlich leichter zu treffen.
                  frei && "cursor-pointer select-none transition active:scale-[0.99]",
                  !frei && "opacity-60",
                  ausgewaehlt.has(t.id) && "bg-primary/5 ring-2 ring-primary"
                )}
                onClick={frei ? () => toggle(t.id) : undefined}
              >
                <CardContent className="flex flex-col gap-3 text-base">
                  <div className="flex flex-wrap items-center gap-2">
                    {frei && (
                      <input
                        type="checkbox"
                        aria-label={`${t.zeit} auswählen`}
                        className="size-6 shrink-0 accent-primary"
                        checked={ausgewaehlt.has(t.id)}
                        onChange={() => toggle(t.id)}
                        // Klick nicht zusätzlich zur Karte durchbubbeln lassen, sonst würde er den Zustand zweimal umschalten.
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
                  {t.beschreibung && <p className="text-muted-foreground">{t.beschreibung}</p>}
                  {belegtFuerRolle && <p className="text-sm text-muted-foreground">Als {rolleLabel} schon besetzt.</p>}
                  {(t.zuordnungen.length > 0 || t.offeneRollen.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {t.zuordnungen.map((z) => (
                        <Badge key={z.id} variant="secondary">
                          {z.label}
                        </Badge>
                      ))}
                      {t.offeneRollen.map((r) => (
                        <Badge key={r} variant="outline">
                          {rolleOptionen.find((o) => o.value === r)?.label ?? r}: offen
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {ausgewaehlt.size > 0 && (
        // Schmale Leiste am unteren Rand: bleibt beim Scrollen sichtbar, verdeckt aber kaum etwas (nur Anzahl + Button).
        <div className="sticky bottom-0 z-20 -mx-2 flex flex-col gap-2 rounded-t-xl border bg-background p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_16px_rgba(0,0,0,0.12)]">
          {fehlt && <p className="text-sm font-medium text-destructive">{fehlt}</p>}
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-base font-semibold">
              {ausgewaehlt.size} {ausgewaehlt.size === 1 ? "Termin" : "Termine"}
            </span>
            <Button type="button" variant="ghost" className="h-12 px-3 text-base" onClick={() => setAusgewaehlt(new Set())}>
              Leeren
            </Button>
            {fehlt ? (
              // Kein SubmitButton: ein übergebenes disabled würde dessen Sperre während des Absendens überschreiben.
              <Button type="button" disabled className="h-12 px-6 text-base">
                Eintragen
              </Button>
            ) : (
              <SubmitButton className="h-12 px-6 text-base" pendingText="Wird eingetragen…">
                Eintragen
              </SubmitButton>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
