"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Öffentliche Eintragung: ENTWEDER mit Zugang (Login-Link) ODER ohne Zugang (nur Name). Umschalten ohne Neuladen (reiner Zustand im Browser).
// Beide Bereiche bleiben im DOM, damit Eingaben beim Hin- und Herschalten nicht verloren gehen. Mit "Mit Zugang" ist der Rest der Seite
// gedämpft und nicht bedienbar (inert): erst einloggen, danach kommt man mit einem Tipp zurück.
type Weg = "zugang" | "ohne";

const OPTIONEN: { weg: Weg; titel: string; text: string }[] = [
  { weg: "zugang", titel: "Mit Zugang", text: "Login-Link per E-Mail, danach ohne Tippen" },
  { weg: "ohne", titel: "Ohne Zugang", text: "Nur Namen angeben" },
];

export function EintragungsWeg({ loginKarte, children }: { loginKarte: ReactNode; children: ReactNode }) {
  const [weg, setWeg] = useState<Weg>("ohne");
  return (
    <>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Wie möchtest du dich eintragen?">
        <p className="text-base font-semibold">Wie möchtest du dich eintragen?</p>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONEN.map((o) => (
            <button
              key={o.weg}
              type="button"
              role="radio"
              aria-checked={weg === o.weg}
              onClick={() => setWeg(o.weg)}
              className={cn(
                "flex min-h-16 flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors",
                weg === o.weg ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted",
              )}
            >
              <span className={cn("text-base font-semibold", weg === o.weg && "text-primary")}>{o.titel}</span>
              <span className="text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={cn(weg !== "zugang" && "hidden")}>{loginKarte}</div>
      {weg === "ohne" && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Kein Login nötig. Bereits angelegte Personen werden automatisch erkannt, bei Unsicherheit prüft der zuständige Wart nach.
        </p>
      )}

      <div
        className={cn("flex flex-col gap-6 transition-opacity", weg === "zugang" && "pointer-events-none opacity-40 select-none")}
        inert={weg === "zugang"}
        aria-hidden={weg === "zugang"}
      >
        {children}
      </div>
    </>
  );
}
