"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DownloadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void> };

const KEY = "hp_install_weg";
// Weggeklickt wird je App (Verein bzw. "Meine Mannschaften"), nicht für die ganze
// Domain — jeder Verein ist eine eigene installierbare Web-App.
const schluessel = (app: string) => `${KEY}:${app}`;
const EVENT = "hp-install-weg";

// Gerätestatus als primitiver Snapshot (stabil für useSyncExternalStore):
// "weg" = bereits installiert oder weggeklickt, "ios" = Safari-Anleitung,
// "normal" = Hinweis nur, wenn der Browser einen Installations-Dialog anbietet.
function status(app: string): "weg" | "ios" | "normal" {
  try {
    if (localStorage.getItem(schluessel(app)) === "1") return "weg";
  } catch {
    // ignorieren
  }
  const installiert =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (installiert) return "weg";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "normal";
}

function abonniere(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

// Hinweis "Als App installieren" für die öffentliche Web-App: Chrome/Android
// über beforeinstallprompt, iOS (Safari kennt das Ereignis nicht) mit
// Anleitung. Wird nicht gezeigt, wenn die App schon installiert ist oder der
// Hinweis weggeklickt wurde.
export function InstallHinweis({ appName, appId }: { appName: string; appId: string }) {
  const [ereignis, setEreignis] = useState<InstallEvent | null>(null);
  const zustand = useSyncExternalStore(abonniere, () => status(appId), () => "weg" as const);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEreignis(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const ios = zustand === "ios";
  const weg = zustand === "weg";

  if (weg || (!ereignis && !ios)) return null;

  const schliessen = () => {
    try {
      localStorage.setItem(schluessel(appId), "1");
    } catch {
      // ignorieren
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="flex items-start gap-3 rounded-xl bg-background p-3 text-sm ring-1 ring-foreground/[0.06]">
      <DownloadIcon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">„{appName}“ als App installieren</p>
        {ereignis ? (
          <p className="text-xs text-muted-foreground">
            Direkt vom Startbildschirm öffnen, auch bei schlechtem Empfang – deine Favoriten bleiben dort
            zuverlässiger gespeichert.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tippe auf „Teilen“ und dann auf „Zum Home-Bildschirm“. In der App bleiben deine Favoriten
            zuverlässiger gespeichert (Safari löscht Webseiten-Daten nach längerer Pause).
          </p>
        )}
        {ereignis && (
          <Button size="sm" className="mt-2" onClick={() => void ereignis.prompt()}>
            Installieren
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={schliessen}
        aria-label="Hinweis schließen"
        className="text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
