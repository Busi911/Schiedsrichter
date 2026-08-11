"use client";

import { useEffect } from "react";

// Global (nicht nur auf /profil, siehe push-anmelden.tsx) für die
// PWA-Installierbarkeit (Chrome/Android verlangt einen registrierten
// Service Worker) — erneutes register() auf einer bereits registrierten
// URL ist ein No-op im Browser, daher ungefährlich mehrfach aufzurufen.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
