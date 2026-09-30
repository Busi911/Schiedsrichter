"use client";

import { useState, useSyncExternalStore } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, Share2Icon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Der login-freie Selbsteintragungs-Link der Warte (Zeitnehmer/Sekretär,
// Ordner/Kioskdienst/Kassierer) — wird im Alltag vor allem per Messenger an
// Elterngruppen weitergegeben, deshalb hier mit Kopieren/Teilen/Öffnen statt
// nur als Text zum manuellen Markieren (auf dem Handy mühsam, dort zudem die
// Hauptnutzung).
export function SelbsteintragungLink({
  url,
  teilText,
}: {
  url: string;
  // Begleittext beim Teilen, z.B. "Trag dich hier als Zeitnehmer ein:".
  teilText: string;
}) {
  const [kopiert, setKopiert] = useState(false);
  // navigator.share gibt es nur in manchen Browsern (v.a. mobil) — auf dem
  // Server/bei der Hydration immer false, damit beide Renderings übereinstimmen.
  const kannTeilen = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  );

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(url);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Zwischenablage nicht verfügbar (z.B. unsicherer Kontext) — der Link
      // steht zum manuellen Markieren weiterhin sichtbar darüber.
    }
  }

  async function teilen() {
    try {
      await navigator.share({ text: teilText, url });
    } catch {
      // Abbruch durch die Person ist kein Fehler.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg border bg-background p-3 font-mono text-sm break-all select-all">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" onClick={kopieren} className="flex-1 sm:flex-none">
          {kopiert ? <CheckIcon /> : <CopyIcon />}
          {kopiert ? "Kopiert" : "Link kopieren"}
        </Button>
        {kannTeilen ? (
          <Button type="button" size="lg" variant="outline" onClick={teilen} className="flex-1 sm:flex-none">
            <Share2Icon />
            Teilen
          </Button>
        ) : (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${teilText} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg", variant: "outline" }), "flex-1 sm:flex-none")}
          >
            <Share2Icon />
            Per WhatsApp teilen
          </a>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "lg", variant: "ghost" }))}
        >
          <ExternalLinkIcon />
          Öffnen
        </a>
      </div>
    </div>
  );
}
