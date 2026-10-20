"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckIcon, Share2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

// Teilen-Button für mobile Endgeräte: nutzt die Web Share API
// (navigator.share), wenn verfügbar — sonst Fallback in die
// Zwischenablage mit sichtbarem Hinweis "Link kopiert".
// Tippfläche ≥ 44 px (min-h-11), kein Tracking-Parameter.
export function TeilenButton({
  url,
  titel,
  className,
}: {
  // URL zum Teilen (nackt, ohne Tracking-Parameter). Wenn nicht
  // angegeben, wird die aktuelle Seiten-URL verwendet.
  url?: string;
  // Titel für den Share-Dialog (optional).
  titel?: string;
  className?: string;
}) {
  const [kopiert, setKopiert] = useState(false);
  // navigator.share gibt es nur in manchen Browsern (v.a. mobil) — auf
  // dem Server/bei der Hydration immer false, damit beide Renderings
  // übereinstimmen (siehe selbsteintragung-link.tsx für das Muster).
  const kannTeilen = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

  async function teilen() {
    const zielUrl = url ?? window.location.href;
    if (kannTeilen) {
      try {
        await navigator.share({
          title: titel,
          url: zielUrl,
        });
      } catch {
        // Nutzer hat den Share-Dialog abgebrochen — kein Fehler.
      }
    } else {
      try {
        await navigator.clipboard.writeText(zielUrl);
        setKopiert(true);
        setTimeout(() => setKopiert(false), 2500);
      } catch {
        // Clipboard-API nicht verfügbar — stillschweigend ignorieren.
      }
    }
  }

  return (
    <button
      type="button"
      onClick={teilen}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground",
        className,
      )}
      aria-label={kannTeilen ? "Teilen" : "Link kopieren"}
    >
      {kopiert ? (
        <>
          <CheckIcon className="size-4 text-emerald-600" />
          <span aria-live="polite" className="text-emerald-600">
            Link kopiert
          </span>
        </>
      ) : (
        <>
          <Share2Icon className="size-4" />
          <span>Teilen</span>
        </>
      )}
    </button>
  );
}
