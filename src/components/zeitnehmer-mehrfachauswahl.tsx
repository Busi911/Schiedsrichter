"use client";

import { useState } from "react";
import { zeitnehmerSelbstEintragenMehrfachOeffentlich } from "@/app/zeitnehmer-eintragen/[token]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import { cn } from "@/lib/utils";

const ROLLE_OPTIONEN = [
  { value: "zeitnehmer", label: "Zeitnehmer" },
  { value: "sekretaer", label: "Sekretär" },
];

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

// Ersetzt die frühere Einzel-Eintragung (ein Formular je Termin) — Checkbox
// pro noch offenem Termin, EIN gemeinsames Formular für Name/Rolle trägt
// sich dann für alle ausgewählten Termine auf einmal ein (siehe
// zeitnehmerSelbstEintragenMehrfachOeffentlich). Selektionszustand braucht
// Client-State, daher hier statt direkt in page.tsx (Server Component) —
// gleiches Mehrfachauswahl-Muster wie in mannschaften-tabelle.tsx.
export function ZeitnehmerMehrfachAuswahl({
  token,
  termine,
}: {
  token: string;
  termine: EintragbarerTermin[];
}) {
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set());
  // Tages-Überschriften nur, wenn die Liste tatsächlich mehrere Kalendertage
  // umfasst (z.B. bei "Alle" mit vielen Mannschaften) — bei nur einem Tag
  // wäre eine einzelne, immer gleiche Überschrift nur Rauschen (siehe
  // gleiches Prinzip in turnier-spielplan.tsx).
  const mehrtaegig = new Set(termine.map((t) => t.tag)).size > 1;

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
      {ausgewaehlt.size > 0 && (
        <form
          action={zeitnehmerSelbstEintragenMehrfachOeffentlich}
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
              options={ROLLE_OPTIONEN}
              required
            />
          </div>
          <Button type="submit" size="sm">
            Für alle eintragen
          </Button>
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
