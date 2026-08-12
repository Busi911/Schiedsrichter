// Service Worker für Push-Benachrichtigungen und PWA-Installierbarkeit.
// Bewusst ohne Offline-Caching/Fetch-Handler — die App ist serverseitig
// gerendert (Server Actions, RLS-Session), ein Offline-Modus wäre ohnehin
// nicht sinnvoll nutzbar.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "HandballerPate", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "HandballerPate", {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url ?? "/profil" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/profil";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
