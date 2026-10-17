// Service Worker: (1) macht die App installierbar (Chrome/Android verlangt
// einen registrierten Service Worker, siehe ServiceWorkerRegistrar in
// src/components/sw-register.tsx) und (2) hält die ÖFFENTLICHEN Seiten der
// Fan-Web-App offline bereit: /verein/…, /meine und /api/liga/… werden
// "network first with timeout" geladen und der letzte Stand gecacht, damit
// z.B. in der Halle ohne Empfang der zuletzt gesehene Spielplan erscheint.
// Bei schlechter Verbindung (Timeout nach ~4 s) wird auf den Cache
// zurückgefallen. Ist auch nichts im Cache, wird eine statische
// Offline-Seite (offline.html) gezeigt.
//
// Bewusst NICHT gecacht: alles andere (Admin, Profil, Login, Server Actions,
// Seiten mit Session) — dort wäre ein veralteter Stand falsch oder
// datenschutzrelevant. Gecacht werden nur Seitenaufrufe (mode "navigate") und
// die öffentliche Favoriten-API, keine RSC-/Prefetch-Anfragen (sonst würden
// HTML und Flight-Daten derselben URL vermischt).
const CACHE = "hp-oeffentlich-v2";
const MAX_EINTRAEGE = 60;
const NETZ_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function oeffentlich(url, request) {
  if (url.pathname.startsWith("/api/liga/")) return true;
  if (request.mode !== "navigate") return false;
  return (
    url.pathname === "/meine" ||
    url.pathname === "/verein" ||
    url.pathname.startsWith("/verein/")
  );
}

async function begrenze(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_EINTRAEGE))) {
    await cache.delete(key);
  }
}

// fetch mit Timeout — liefert die Netz-Antwort oder wirft nach NETZ_TIMEOUT_MS,
// damit bei schlechter Verbindung (Halle ohne Empfang) schnell auf den Cache
// zurückgefallen wird statt lange zu warten.
function fetchMitTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETZ_TIMEOUT_MS);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !oeffentlich(url, request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const antwort = await fetchMitTimeout(request);
        // Nur erfolgreiche Antworten merken (keine Weiterleitung auf /login).
        if (antwort.ok && !antwort.redirected) {
          cache.put(request, antwort.clone()).then(() => begrenze(cache));
        }
        return antwort;
      } catch (fehler) {
        // Netz fehlgeschlagen oder Timeout — Cache versuchen.
        const gemerkt = await cache.match(request);
        if (gemerkt) return gemerkt;
        // Nichts im Cache — Offline-Fallback-Seite, wenn verfügbar.
        const offline = await cache.match(new Request("/offline.html"));
        if (offline) return offline;
        // Letzter Ausweg: den Fehler weiterwerfen (Browser zeigt
        // seine eigene Offline-Fehlerseite).
        throw fehler;
      }
    })()
  );
});
