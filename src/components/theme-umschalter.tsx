"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Darstellung: "system" (Standard, folgt der Geräte-Einstellung) | "light" | "dark". Gespeichert nur im Browser
// (localStorage "hp-theme", kein Konto/keine DB). Die Klasse "dark" auf <html> setzt zuerst das Inline-Skript im
// Root-Layout (vor dem ersten Zeichnen, kein Aufblitzen); dieser Umschalter ändert sie danach.
export type Darstellung = "system" | "light" | "dark";
const SCHLUESSEL = "hp-theme";
const EREIGNIS = "hp-theme-geaendert";

function lese(): Darstellung {
  try {
    const w = localStorage.getItem(SCHLUESSEL);
    return w === "light" || w === "dark" ? w : "system";
  } catch {
    return "system";
  }
}

function abonnieren(callback: () => void) {
  window.addEventListener(EREIGNIS, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EREIGNIS, callback);
    window.removeEventListener("storage", callback);
  };
}

function setze(modus: Darstellung) {
  try {
    if (modus === "system") localStorage.removeItem(SCHLUESSEL);
    else localStorage.setItem(SCHLUESSEL, modus);
  } catch {
    // Speicher gesperrt (z.B. privater Modus): gilt dann nur bis zum Neuladen.
  }
  const dunkel =
    modus === "dark" || (modus === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dunkel);
  window.dispatchEvent(new Event(EREIGNIS));
}

const OPTIONEN: { wert: Darstellung; label: string; icon: typeof SunIcon }[] = [
  { wert: "system", label: "Automatisch", icon: MonitorIcon },
  { wert: "light", label: "Hell", icon: SunIcon },
  { wert: "dark", label: "Dunkel", icon: MoonIcon },
];

export function ThemeUmschalter() {
  const aktuell = useSyncExternalStore(abonnieren, lese, () => "system" as Darstellung);
  return (
    <div role="group" aria-label="Darstellung" className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {OPTIONEN.map(({ wert, label, icon: Icon }) => (
        <button
          key={wert}
          type="button"
          onClick={() => setze(wert)}
          aria-pressed={aktuell === wert}
          title={label}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            aktuell === wert ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
