"use client";

import { useEffect } from "react";

// Für die PWA-Installierbarkeit (Chrome/Android verlangt einen
// registrierten Service Worker, siehe public/sw.js) — erneutes register()
// auf einer bereits registrierten URL ist ein No-op im Browser, daher
// ungefährlich mehrfach aufzurufen.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
