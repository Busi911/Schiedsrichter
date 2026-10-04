"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Zeigt einen kleinen Spinner, solange die Navigation des umgebenden <Link>
// läuft (siehe useLinkStatus) — z.B. für die Mannschafts-Filter-Pills auf
// /zeitnehmer-eintragen/[token], deren Klick einen Server-Component-Reload
// auslöst und ohne Rückmeldung wie ein totes UI wirkt. Muss Nachfahre eines
// <Link> sein (hier: Kind des Button, dessen render-Prop auf Link zeigt).
export function LinkSpinner() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Loader2 className="size-3 animate-spin" />;
}

// Für Navigationsleisten: ersetzt das Symbol (Icon) des umgebenden <Link> durch einen Spinner, solange
// dessen Seite lädt — sonst wirkt ein Tipp auf einen Tab bei langsamer Verbindung reaktionslos. Der
// Spinner übernimmt die Größe des Symbols (className), damit nichts springt.
export function LinkSymbol({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{children}</>;
  return <Loader2 className={cn("animate-spin", className)} aria-hidden="true" />;
}
