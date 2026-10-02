"use client";

import { useEffect, useState } from "react";

// Kurzes Sponsorenbild beim Öffnen der öffentlichen Vereinsseite: "Präsentiert von …", verschwindet nach
// wenigen Sekunden oder per Tipp. Erscheint höchstens EINMAL PRO TAG und Gerät (nur lokal im Browser
// vermerkt — kein Cookie, kein Tracking, nichts geht an einen Server). Mit ?sponsor=zeigen erzwingbar
// (Vorschau für den Systemadmin). Der Inhalt der Seite liegt darunter bereits im DOM.
export function SponsorSplash({
  bildUrl,
  name,
  link,
  dauerSekunden,
  version,
}: {
  bildUrl: string;
  name: string | null;
  link: string | null;
  dauerSekunden: number;
  version: string;
}) {
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    const heute = new Date().toLocaleDateString("sv-SE");
    const schluessel = `hp_sponsor_${version}`;
    const erzwingen = new URLSearchParams(window.location.search).get("sponsor") === "zeigen";
    let schonGezeigt = false;
    try {
      schonGezeigt = window.localStorage.getItem(schluessel) === heute;
    } catch {
      // Speicher gesperrt (z.B. privates Fenster): dann bei jedem Öffnen zeigen ist unproblematisch.
    }
    if (schonGezeigt && !erzwingen) return;
    try {
      window.localStorage.setItem(schluessel, heute);
    } catch {
      // ignoriert
    }
    // Anzeige im nächsten Takt starten (nicht synchron im Effekt), Ende nach der eingestellten Dauer.
    const start = window.setTimeout(() => setSichtbar(true), 0);
    const ende = window.setTimeout(() => setSichtbar(false), Math.max(2, dauerSekunden) * 1000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSichtbar(false);
    window.addEventListener("keydown", esc);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(ende);
      window.removeEventListener("keydown", esc);
    };
  }, [version, dauerSekunden]);

  if (!sichtbar) return null;

  const bild = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={bildUrl} alt={name ? `Sponsor: ${name}` : "Sponsor"} className="max-h-[45vh] max-w-full object-contain" />
  );

  return (
    <div
      role="dialog"
      aria-label="Präsentiert von"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/95 p-6 text-center backdrop-blur-sm"
      onClick={() => setSichtbar(false)}
    >
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">Präsentiert von</p>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={(e) => e.stopPropagation()}
          className="flex max-w-full flex-col items-center gap-3"
        >
          {bild}
          {name && <span className="font-heading text-lg font-semibold">{name}</span>}
        </a>
      ) : (
        <div className="flex max-w-full flex-col items-center gap-3">
          {bild}
          {name && <span className="font-heading text-lg font-semibold">{name}</span>}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSichtbar(false);
        }}
        className="rounded-full border px-5 py-2 text-sm font-medium"
      >
        Weiter
      </button>
    </div>
  );
}
