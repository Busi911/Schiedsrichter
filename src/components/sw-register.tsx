"use client";

import { useEffect } from "react";
import { gleicheFavoritenMitCookieAb } from "@/lib/liga-favoriten-lokal";

// Für die PWA-Installierbarkeit (Chrome/Android verlangt einen
// registrierten Service Worker, siehe public/sw.js) — erneutes register()
// auf einer bereits registrierten URL ist ein No-op im Browser, daher
// ungefährlich mehrfach aufzurufen.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Nur auf den öffentlichen Fan-Seiten relevant (Favoriten).
    const pfad = window.location.pathname;
    if (pfad === "/meine" || pfad === "/verein" || pfad.startsWith("/verein/") || pfad.startsWith("/meine/")) {
      void gleicheFavoritenMitCookieAb();
    }
  }, []);
  return null;
}
