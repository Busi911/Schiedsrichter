"use client";

import { useState } from "react";
import { zeitnehmerSelbstEintragenMehrfachOeffentlich } from "@/app/zeitnehmer-eintragen/[token]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";

const ROLLE_OPTIONEN = [
  { value: "zeitnehmer", label: "Zeitnehmer" },
  { value: "sekretaer", label: "Sekretär" },
];

export type EintragbarerTermin = {
  id: string;
  zeit: string;
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
        </form>
      )}

      {termine.map((t) => (
        <Card key={t.id} className="min-w-0">
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {t.eintragbar && (
                <input
                  type="checkbox"
                  aria-label={`${t.zeit} auswählen`}
                  checked={ausgewaehlt.has(t.id)}
                  onChange={() => toggle(t.id)}
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
      ))}
    </div>
  );
}
