"use client";

import { useEffect, useRef, useState } from "react";

// Kurzes Sponsorenbild beim Öffnen der öffentlichen Vereinsseite: "Präsentiert von …", verschwindet nach
// wenigen Sekunden oder per Tipp. Erscheint höchstens EINMAL PRO TAG und Gerät (nur lokal im Browser
// vermerkt — kein Cookie, kein Tracking, nichts geht an einen Server). Mit ?sponsor=zeigen erzwingbar
// (Vorschau für den Systemadmin). Der Inhalt der Seite liegt darunter bereits im DOM.
//
// Barrierefreiheit: Der Dialog hat role="dialog" + aria-modal="true", der Schließen-Button bekommt beim
// Öffnen den Fokus, beim Schließen wird der Fokus auf das zuvor aktive Element zurückgeführt. Der
// Schließen-Button hat eine Tippfläche von ≥ 44 px (min-h-11 min-w-11) und ein beschreibendes aria-label.
// Während der Dialog sichtbar ist, werden alle Geschwister-Elemente inert (nicht bedienbar) und eine
// Tab-Falle hält die Tastatur-Navigation innerhalb des Dialogs.
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const schliessenRef = useRef<HTMLButtonElement>(null);
  const vorherigerFokus = useRef<HTMLElement | null>(null);

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
    const start = window.setTimeout(() => {
      vorherigerFokus.current = (document.activeElement as HTMLElement) ?? null;
      setSichtbar(true);
    }, 0);
    const ende = window.setTimeout(() => setSichtbar(false), Math.max(2, dauerSekunden) * 1000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSichtbar(false);
    window.addEventListener("keydown", esc);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(ende);
      window.removeEventListener("keydown", esc);
    };
  }, [version, dauerSekunden]);

  // Fokus auf den Schließen-Button setzen, sobald der Dialog sichtbar wird.
  useEffect(() => {
    if (sichtbar && schliessenRef.current) {
      schliessenRef.current.focus();
    }
  }, [sichtbar]);

  // Fokus zurückführen, sobald der Dialog verschwindet.
  useEffect(() => {
    if (!sichtbar && vorherigerFokus.current) {
      vorherigerFokus.current.focus();
      vorherigerFokus.current = null;
    }
  }, [sichtbar]);

  // Hintergrund nicht bedienbar machen, während der Dialog sichtbar ist:
  // inert auf alle Geschwister-Elemente des Dialogs setzen.
  useEffect(() => {
    if (!sichtbar || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const parent = dialog.parentElement;
    if (!parent) return;
    const geschwister = Array.from(parent.children).filter((el) => el !== dialog);
    geschwister.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      geschwister.forEach((el) => el.removeAttribute("inert"));
    };
  }, [sichtbar]);

  // Tab-Falle: Tab/Shift+Tab innerhalb des Dialogs halten.
  useEffect(() => {
    if (!sichtbar) return;
    const tabFalle = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const fokusierbar = dialog.querySelectorAll<HTMLElement>(
        'button, a, input, [tabindex]:not([tabindex="-1"])',
      );
      if (fokusierbar.length === 0) return;
      const erste = fokusierbar[0];
      const letzte = fokusierbar[fokusierbar.length - 1];
      if (e.shiftKey && document.activeElement === erste) {
        e.preventDefault();
        letzte.focus();
      } else if (!e.shiftKey && document.activeElement === letzte) {
        e.preventDefault();
        erste.focus();
      }
    };
    window.addEventListener("keydown", tabFalle);
    return () => window.removeEventListener("keydown", tabFalle);
  }, [sichtbar]);

  if (!sichtbar) return null;

  const bild = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={bildUrl} alt={name ? `Sponsor: ${name}` : "Sponsor"} className="max-h-[45vh] max-w-full object-contain" />
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={name ? `Sponsor: ${name}` : "Sponsor"}
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
        ref={schliessenRef}
        type="button"
        aria-label="Sponsor-Anzeige schließen"
        onClick={(e) => {
          e.stopPropagation();
          setSichtbar(false);
        }}
        className="min-h-11 min-w-11 rounded-full border px-5 py-2 text-sm font-medium"
      >
        Weiter
      </button>
    </div>
  );
}
