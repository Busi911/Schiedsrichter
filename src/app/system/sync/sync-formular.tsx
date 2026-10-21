"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ligaSyncJetztAusfuehren, ligaSyncSchritt } from "./actions";

// Sicherheitsgrenze gegen eine echte Endlosschleife (z. B. bei einem Verein, der jeden Lauf scheitern
// lässt): bei normalerweise wenigen offenen Vereinen je Durchlauf reicht das weit.
const MAX_DURCHLAEUFE = 30;

export function SyncFormular() {
  const [slug, setSlug] = useState("");
  const [erzwingen, setErzwingen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const abbrechenRef = useRef(false);

  async function automatischBisFertig() {
    setLaeuft(true);
    setLog([]);
    abbrechenRef.current = false;
    let durchlauf = 0;
    let gesamt = 0;
    while (!abbrechenRef.current && durchlauf < MAX_DURCHLAEUFE) {
      durchlauf++;
      try {
        const r = await ligaSyncSchritt({ slug, erzwingen });
        if (r.haengt) {
          setLog((l) => [...l, `Durchlauf ${durchlauf}: läuft im Hintergrund weiter (über 268 s) — bitte in ein paar Minuten direkt beim Verein prüfen.`]);
          break;
        }
        gesamt += r.anzahl;
        setLog((l) => [...l, `Durchlauf ${durchlauf}: ${r.anzahl} Verein(e) in ${r.dauerSekunden} s${r.text ? ` — ${r.text}` : ""}`]);
        if (r.vollstaendig) {
          setLog((l) => [...l, `Fertig — insgesamt ${gesamt} Verein(e) in ${durchlauf} Durchlauf${durchlauf === 1 ? "" : "en"}.`]);
          break;
        }
      } catch (err) {
        setLog((l) => [...l, `Fehler: ${err instanceof Error ? err.message : String(err)}`]);
        break;
      }
    }
    if (!abbrechenRef.current && durchlauf >= MAX_DURCHLAEUFE) {
      setLog((l) => [...l, `Angehalten nach ${MAX_DURCHLAEUFE} Durchläufen (Sicherheitsgrenze) — es sind noch Vereine offen, bitte erneut starten.`]);
    }
    setLaeuft(false);
  }

  return (
    <form action={ligaSyncJetztAusfuehren} className="flex flex-col gap-3">
      {!laeuft && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Nur dieser Verein (Slug, leer = alle)</Label>
            <Input
              id="slug"
              name="slug"
              placeholder="z. B. hsg-linden"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="erzwingen"
              className="mt-1 size-4"
              checked={erzwingen}
              onChange={(e) => setErzwingen(e.target.checked)}
            />
            <span>
              Alles neu laden (auch wenn nicht fällig)
              <span className="block text-xs text-muted-foreground">
                Übergeht Intervall und 30-Minuten-Sperre, z. B. um einen eben erschienenen Spielbericht-Link sofort
                zu holen. Am besten mit einem Verein, das dauert sonst länger.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingText="Sync läuft …">Einmal ausführen</SubmitButton>
            <Button type="button" variant="secondary" onClick={automatischBisFertig}>
              Automatisch bis alle Vereine durch sind
            </Button>
          </div>
        </>
      )}
      {laeuft && (
        <div className="flex flex-wrap items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Läuft automatisch weiter …</p>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => (abbrechenRef.current = true)}>
            Abbrechen
          </Button>
        </div>
      )}
      {log.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border bg-muted p-3 text-xs break-words">
          {log.map((zeile, i) => (
            <li key={i}>{zeile}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
