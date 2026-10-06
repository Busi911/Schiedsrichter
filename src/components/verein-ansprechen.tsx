"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { kontaktAngeschrieben, kontaktSpeichern } from "@/app/system/vereine/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/submit-button";

// Ansprache eines Vereins in Vorbereitung per Instagram — bewusst von Hand: Text kopieren, Profil öffnen,
// selbst senden. Vorschlag bearbeitbar; "angeschrieben am" und Notiz sind nur für den Systemadmin sichtbar.
export function VereinAnsprechen({
  vereinId,
  text,
  instagram,
  profilUrl,
  angeschriebenAm,
  notiz,
  hinweise,
}: {
  vereinId: string;
  text: string | null;
  instagram: string | null;
  profilUrl: string | null;
  angeschriebenAm: string | null;
  notiz: string | null;
  hinweise: string[];
}) {
  const feld = useRef<HTMLTextAreaElement>(null);
  const [kopiert, setKopiert] = useState(false);

  async function kopieren() {
    const wert = feld.current?.value ?? "";
    try {
      await navigator.clipboard.writeText(wert);
    } catch {
      feld.current?.select();
      document.execCommand("copy");
    }
    setKopiert(true);
    setTimeout(() => setKopiert(false), 2500);
  }

  return (
    <div className="mt-3 space-y-3 text-xs">
      {hinweise.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          {hinweise.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      <form action={kontaktSpeichern} className="flex flex-col gap-2">
        <input type="hidden" name="vereinId" value={vereinId} />
        <label className="text-muted-foreground" htmlFor={`ig-${vereinId}`}>
          Instagram des Vereins
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id={`ig-${vereinId}`} name="instagram" defaultValue={instagram ? `@${instagram}` : ""} placeholder="@vereinsname oder Profil-Link" className="h-8 max-w-60" />
          <Input name="notiz" defaultValue={notiz ?? ""} placeholder="Notiz (nur für dich)" aria-label="Notiz" className="h-8 min-w-0 flex-1" />
          <SubmitButton size="sm" variant="outline" pendingText="Speichert…">
            Speichern
          </SubmitButton>
        </div>
      </form>

      {text ? (
        <div className="space-y-2">
          <textarea ref={feld} defaultValue={text} rows={14} aria-label="Nachricht" className="w-full rounded-md border bg-background p-2 text-sm leading-snug" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={kopieren}>
              {kopiert ? <CheckIcon /> : <CopyIcon />}
              {kopiert ? "Kopiert" : "Text kopieren"}
            </Button>
            {profilUrl ? (
              <a href={profilUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted">
                <ExternalLinkIcon className="size-3.5" /> Instagram öffnen
              </a>
            ) : (
              <span className="text-muted-foreground">Instagram-Namen eintragen, dann lässt sich das Profil öffnen.</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">Erst einen Vorschau-Link erzeugen (7 Tage empfohlen), dann erscheint hier der Nachrichtentext.</p>
      )}

      <form action={kontaktAngeschrieben} className="flex flex-wrap items-center gap-2 border-t pt-2">
        <input type="hidden" name="vereinId" value={vereinId} />
        {angeschriebenAm ? (
          <>
            <span className="font-medium">Angeschrieben am {angeschriebenAm}</span>
            <input type="hidden" name="zuruecksetzen" value="1" />
            <SubmitButton size="sm" variant="ghost" pendingText="…">
              zurücksetzen
            </SubmitButton>
          </>
        ) : (
          <SubmitButton size="sm" variant="outline" pendingText="Speichert…">
            Als angeschrieben markieren
          </SubmitButton>
        )}
      </form>
    </div>
  );
}
