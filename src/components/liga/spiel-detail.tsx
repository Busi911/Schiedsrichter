"use client";

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Macht eine Spielkarte antippbar: ein Tipp auf die Karte (nicht auf einen Link darin) öffnet ein Fenster mit den Spieldetails.
// Karte und Details werden serverseitig gerendert und hier nur zusammengesetzt.
export function SpielDetail({
  titel,
  beschreibung,
  detail,
  children,
}: {
  titel: string;
  beschreibung?: string;
  detail: ReactNode;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(false);

  function beiKlick(e: MouseEvent<HTMLDivElement>) {
    // Links und Knöpfe in der Karte (Halle, Live-Ticker, Spielbericht, Teilen) behalten ihre eigene Wirkung.
    if ((e.target as HTMLElement).closest("a, button")) return;
    setOffen(true);
  }
  function beiTaste(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOffen(true);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label={`Spieldetails: ${titel}`}
        onClick={beiKlick}
        onKeyDown={beiTaste}
        className="cursor-pointer rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
      </div>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8 text-base leading-snug">{titel}</DialogTitle>
            {beschreibung && <DialogDescription>{beschreibung}</DialogDescription>}
          </DialogHeader>
          {detail}
        </DialogContent>
      </Dialog>
    </>
  );
}
