// Service Worker nur für PWA-Installierbarkeit (Chrome/Android verlangt
// einen registrierten Service Worker, siehe ServiceWorkerRegistrar in
// src/components/sw-register.tsx) — bewusst ohne Push-Handling (das
// Feature wurde entfernt, siehe lib/push.ts in der Git-Historie) und ohne
// Offline-Caching/Fetch-Handler, da die App serverseitig gerendert wird
// (Server Actions, RLS-Session) und ein Offline-Modus ohnehin nicht
// sinnvoll nutzbar wäre.
