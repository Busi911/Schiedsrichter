"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  zuordnungen: { id: string; label: string }[];
};

export type MehrfachEintragErgebnis = {
  eingetragen: number;
  gesamt: number;
  // Mehrere Fehler mit " | " getrennt, analog zu den Import-/nuLiga-
  // Ergebnissen in admin/funktionstraeger und admin/einstellungen.
  fehler: string | null;
};

// Ersetzt die frühere Einzel-Eintragung (ein Formular je Termin) — Checkbox
// pro noch offenem Termin, EIN gemeinsames Formular für Name/Rolle trägt
// sich dann für alle ausgewählten Termine auf einmal ein. Rollenneutral
// (rolleOptionen/submitAction als Props) — genutzt sowohl von
// /zeitnehmer-eintragen (Zeitnehmer/Sekretär) als auch /ordner-eintragen
// (Ordner/Kioskdienst), gleiches Mehrfachauswahl-Muster wie in
// mannschaften-tabelle.tsx. Selektionszustand braucht Client-State, daher
// hier statt direkt in der jeweiligen (Server Component) page.tsx.
export function TerminMehrfachAuswahl({
  token,
  termine,
  rolleOptionen,
  submitAction,
}: {
  token: string;
  termine: EintragbarerTermin[];
  rolleOptionen: { value: string; label: string }[];
  submitAction: (formData: FormData) => Promise<MehrfachEintragErgebnis>;
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  // Tages-Überschriften nur, wenn die Liste tatsächlich mehrere Kalendertage
  // umfasst (z.B. bei "Alle" mit vielen Mannschaften) — bei nur einem Tag
  // wäre eine einzelne, immer gleiche Überschrift nur Rauschen (siehe
  // gleiches Prinzip in turnier-spielplan.tsx).
  const mehrtaegig = new Set(termine.map((t) => t.tag)).size > 1;

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
      {// Außerhalb des Formulars, da das Formular nach einem Teilerfolg
      // (mindestens ein Termin eingetragen) ausgeblendet wird, sobald die
      // Auswahl zurückgesetzt ist — die Fehlermeldung zu den restlichen,
      // fehlgeschlagenen Terminen soll trotzdem sichtbar bleiben.
      status?.fehler && (
        <Alert variant="destructive">
          <AlertDescription>
            {status.eingetragen > 0 && (
              <p>
                {status.eingetragen} von {status.gesamt}{" "}
                {status.gesamt === 1 ? "Termin" : "Terminen"} eingetragen.
              </p>
            )}
            {status.fehler.split(" | ").map((f) => (
              <p key={f}>{f}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {ausgewaehlt.size > 0 && (
        <form
          action={submitActionState}
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3"
        >
          <input type="hidden" name="token" value={token} />
          {[...ausgewaehlt].map((id) => (
            <input key={id} type="hidden" name="terminIds" value={id} />
          ))}
          <span className="text-xs text-muted-foreground">
            {ausgewaehlt.size} {ausgewaehlt.size === 1 ? "Termin" : "Termine"}{" "}
            ausgewählt
          </span>
          <Input
            name="name"
            placeholder="Dein Name"
            required
            className="h-8 min-w-48 flex-1"
          />
          <div className="w-36">
            <LabeledSelect
              name="rolle"
              placeholder="Rolle…"
              options={rolleOptionen}
              required
            />
          </div>
          <SubmitButton size="sm" pendingText="Wird eingetragen…">
            Für alle eintragen
          </SubmitButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAusgewaehlt(new Set())}
          >
            Auswahl zurücksetzen
          </Button>
        </form>
      )}

      {termine.map((t, i) => (
        <div key={t.id} className="flex flex-col gap-3">
          {mehrtaegig && (i === 0 || termine[i - 1].tag !== t.tag) && (
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
              t.eintragbar && "cursor-pointer select-none"
            )}
            onClick={t.eintragbar ? () => toggle(t.id) : undefined}
          >
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {t.eintragbar && (
                  <input
                    type="checkbox"
                    aria-label={`${t.zeit} auswählen`}
                    checked={ausgewaehlt.has(t.id)}
                    onChange={() => toggle(t.id)}
                    // Klick nicht zusätzlich zur Karte durchbubbeln lassen,
                    // sonst würde ein Klick direkt auf die Checkbox den
                    // Zustand zweimal umschalten (einmal hier, einmal über
                    // onClick der Karte).
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <span className="font-medium">{t.zeit}</span>
                <Badge variant="outline">{t.typLabel}</Badge>
                <Badge variant={t.vollstaendig ? "secondary" : "outline"}>
                  {t.vollstaendig ? "Besetzung vollständig" : "Besetzung offen"}
                </Badge>
                {t.ort && <span className="text-muted-foreground">{t.ort}</span>}
              </div>
              {t.beschreibung && (
                <p className="text-muted-foreground">{t.beschreibung}</p>
              )}
              {t.zuordnungen.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.zuordnungen.map((z) => (
                    <Badge key={z.id} variant="secondary">
                      {z.label}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
