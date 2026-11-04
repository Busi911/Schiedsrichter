"use client";

import { useState } from "react";
import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuellenPruefung } from "@/lib/quellen-test";
import { quellenTestAusfuehren } from "./actions";

const QUELLE: Record<string, string> = { handball_net: "handball.net (DHB)", nuliga: "nuLiga (HHV)", ndr: "NDR (1./2. HBL)" };

export function QuellenTest() {
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<QuellenPruefung[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  async function starten() {
    setLaeuft(true);
    setFehler(null);
    try {
      setErgebnis(await quellenTestAusfuehren());
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    }
    setLaeuft(false);
  }

  const gruppen = ergebnis ? [...new Set(ergebnis.map((e) => e.quelle))] : [];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" onClick={starten} disabled={laeuft}>
          {laeuft && <Loader2 className="animate-spin" />}
          {laeuft ? "Teste …" : "Quellen jetzt testen"}
        </Button>
      </div>
      {fehler && <p className="text-sm break-words text-destructive">{fehler}</p>}
      {gruppen.map((q) => (
        <div key={q}>
          <p className="text-sm font-medium">{QUELLE[q] ?? q}</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {ergebnis!.filter((e) => e.quelle === q).map((e) => (
              <li key={e.schluessel} className="flex items-start gap-2">
                {(e.uebersprungen || (e.optional && !e.ok)) ? <CircleSlash className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : e.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                <span className="min-w-0 break-words">
                  {e.name}{e.optional ? " (optional)" : ""}: <span className={(e.ok || e.optional) ? "text-muted-foreground" : "text-destructive"}>{e.detail}</span> <span className="text-muted-foreground">({e.dauerMs} ms)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
