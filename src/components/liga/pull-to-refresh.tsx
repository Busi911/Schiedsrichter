"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2Icon, ArrowDownIcon } from "lucide-react";

// Herunterziehen zum Neuladen in der installierten Web-App (Startbildschirm). iOS bietet dort keine eigene Geste;
// im normalen Browser (Safari/Chrome) gibt es sie schon, deshalb läuft das nur im Standalone-Modus. Lädt die
// Seite komplett neu (Server-Daten UND die per API geladenen Favoriten).
const AUSLOESER = 45; // angezeigte Zugstrecke in px (Finger ca. doppelt so weit), ab der Loslassen neu lädt
const MAX = 70;

function istInstalliert(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PullToRefresh() {
  const [zug, setZug] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const start = useRef<number | null>(null);
  const zugRef = useRef(0);

  useEffect(() => {
    if (!istInstalliert()) return;

    const onStart = (e: TouchEvent) => {
      // Nur am Seitenanfang und ohne offenen Dialog; sonst gehört die Geste dem Scrollen.
      start.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (zugRef.current !== 0) {
          zugRef.current = 0;
          setZug(0);
        }
        return;
      }
      // Gummiband: je weiter, desto zäher.
      const wert = Math.min(MAX, dy * 0.5);
      zugRef.current = wert;
      setZug(wert);
    };
    const onEnde = () => {
      const ausgeloest = start.current !== null && zugRef.current >= AUSLOESER;
      start.current = null;
      if (ausgeloest) {
        setLaedt(true);
        setZug(AUSLOESER);
        window.location.reload();
        return;
      }
      zugRef.current = 0;
      setZug(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnde, { passive: true });
    window.addEventListener("touchcancel", onEnde, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnde);
      window.removeEventListener("touchcancel", onEnde);
    };
  }, []);

  if (zug === 0 && !laedt) return null;
  const bereit = zug >= AUSLOESER;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ transform: `translateY(${Math.max(zug - 36, -36)}px)` }}
    >
      <div className="mt-[env(safe-area-inset-top)] flex size-9 items-center justify-center rounded-full border bg-background text-foreground shadow-md">
        {laedt ? (
          <Loader2Icon className="size-4 animate-spin" aria-label="Lädt neu" />
        ) : (
          <ArrowDownIcon
            className="size-4 transition-transform"
            style={{ transform: bereit ? "rotate(180deg)" : undefined }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
