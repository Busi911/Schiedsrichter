"use client";

import { useEffect } from "react";

// Beim Öffnen einer Mannschaftsseite (Layout wird neu eingehängt) nach oben
// scrollen. Next.js scrollt bei Navigation sonst nur bis zum Anfang des
// geänderten Seitenbereichs — der Kopf des (unverändert bleibenden)
// Vereins-Layouts bliebe dann außerhalb des sichtbaren Bereichs. Beim
// Wechsel zwischen den Tabs derselben Mannschaft bleibt das Layout bestehen,
// der Effekt läuft nicht erneut.
export function ScrollNachOben({ schluessel }: { schluessel: string }) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [schluessel]);
  return null;
}
