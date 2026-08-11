"use client";

import { useEffect, useState } from "react";
import { pushAbbestellen, pushAbonnieren } from "@/app/profil/actions";
import { Button } from "@/components/ui/button";

// Push-Endpunkt-URLs enthalten Base64url ohne Padding — Standard-atob()
// kommt damit nicht klar, daher hier manuell dekodiert (üblicher Web-Push-
// Boilerplate-Code, siehe MDN "Sending and receiving push messages").
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Status =
  | "nicht_unterstuetzt"
  | "nicht_konfiguriert"
  | "geladen"
  | "aktiv"
  | "inaktiv";

export function PushAnmelden() {
  const [status, setStatus] = useState<Status>("geladen");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let abgebrochen = false;

    async function pruefen() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("nicht_unterstuetzt");
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setStatus("nicht_konfiguriert");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (!abgebrochen) setStatus(subscription ? "aktiv" : "inaktiv");
    }

    pruefen().catch(() => setStatus("nicht_unterstuetzt"));
    return () => {
      abgebrochen = true;
    };
  }, []);

  async function aktivieren() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("inaktiv");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      const json = subscription.toJSON();
      await pushAbonnieren({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setStatus("aktiv");
    } finally {
      setBusy(false);
    }
  }

  async function deaktivieren() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await pushAbbestellen(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("inaktiv");
    } finally {
      setBusy(false);
    }
  }

  if (status === "nicht_unterstuetzt") {
    return (
      <p className="text-sm text-muted-foreground">
        Push-Benachrichtigungen werden von diesem Browser/Gerät nicht
        unterstützt.
      </p>
    );
  }
  if (status === "nicht_konfiguriert") {
    return (
      <p className="text-sm text-muted-foreground">
        Push-Benachrichtigungen sind auf diesem Server nicht konfiguriert.
      </p>
    );
  }
  if (status === "geladen") {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        {status === "aktiv"
          ? "Push-Benachrichtigungen sind auf diesem Gerät aktiv."
          : "Push-Benachrichtigungen sind auf diesem Gerät deaktiviert."}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={status === "aktiv" ? deaktivieren : aktivieren}
      >
        {status === "aktiv" ? "Deaktivieren" : "Aktivieren"}
      </Button>
    </div>
  );
}
