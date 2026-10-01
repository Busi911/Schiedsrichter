// Service Worker: (1) macht die App installierbar (Chrome/Android verlangt
// einen registrierten Service Worker, siehe ServiceWorkerRegistrar in
// src/components/sw-register.tsx) und (2) hält die ÖFFENTLICHEN Seiten der
// Fan-Web-App offline bereit: /verein/…, /meine und /api/liga/… werden
// "network first" geladen und der letzte Stand gecacht, damit z.B. in der
// Halle ohne Empfang der zuletzt gesehene Spielplan erscheint.
//
// Bewusst NICHT gecacht: alles andere (Admin, Profil, Login, Server Actions,
// Seiten mit Session) — dort wäre ein veralteter Stand falsch oder
// datenschutzrelevant. Gecacht werden nur Seitenaufrufe (mode "navigate") und
// die öffentliche Favoriten-API, keine RSC-/Prefetch-Anfragen (sonst würden
// HTML und Flight-Daten derselben URL vermischt).
const CACHE = "hp-oeffentlich-v1";
const MAX_EINTRAEGE = 60;

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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !oeffentlich(url, request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const antwort = await fetch(request);
        // Nur erfolgreiche Antworten merken (keine Weiterleitung auf /login).
        if (antwort.ok && !antwort.redirected) {
          cache.put(request, antwort.clone()).then(() => begrenze(cache));
        }
        return antwort;
      } catch (fehler) {
        const gemerkt = await cache.match(request);
        if (gemerkt) return gemerkt;
        throw fehler;
      }
    })()
  );
});
