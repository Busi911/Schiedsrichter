"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";

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
