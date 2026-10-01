"use client";

import { useSyncExternalStore } from "react";
import { LEER, MAX, parseFavoriten, type Favoriten } from "@/lib/liga-favoriten-parse";

export { LEER, parseFavoriten, type Favoriten };

const KEY = "hp_favoriten_v1";
const EVENT = "hp-favoriten-geaendert";

// Favoriten der öffentlichen Seiten liegen NUR im Browser (localStorage) —
// kein Konto nötig. Gespeichert werden ausschließlich die (öffentlichen)
// IDs von Verein/Mannschaft. Jeder Zugriff ist in try/catch, weil
// localStorage in privaten Fenstern/bei blockierten Daten fehlen oder
// werfen kann; die Seiten funktionieren dann ohne Favoriten weiter.

export function schalteUm(
  f: Favoriten,
  typ: "verein" | "mannschaft",
  id: string
): Favoriten {
  const feld = typ === "verein" ? "vereine" : "mannschaften";
  const liste = f[feld].includes(id) ? f[feld].filter((x) => x !== id) : [...f[feld], id].slice(-MAX);
  return { ...f, [feld]: liste };
}

let cacheRaw: string | null | undefined;
let cacheWert: Favoriten = LEER;

function lies(): Favoriten {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cacheWert;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheWert = parseFavoriten(raw);
  }
  return cacheWert;
}

function abonniere(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

// Stabile Referenz je Inhalt (useSyncExternalStore vergleicht per Identität).
export function useFavoriten(): Favoriten {
  return useSyncExternalStore(abonniere, lies, () => LEER);
}

export function favoritUmschalten(typ: "verein" | "mannschaft", id: string): void {
  const neu = schalteUm(lies(), typ, id);
  try {
    localStorage.setItem(KEY, JSON.stringify(neu));
  } catch {
    // Speichern nicht möglich (privater Modus o.Ä.) — nur im Speicher weiterführen.
    cacheRaw = undefined;
    cacheWert = neu;
  }
  window.dispatchEvent(new Event(EVENT));
  spiegleInCookie(neu);
  // Browser bitten, die Daten nicht automatisch aufzuräumen (wirkt v.a. in
  // Chrome/Firefox; best effort, Fehler sind unkritisch).
  void navigator.storage?.persist?.().catch(() => {});
}

// Spiegel als serverseitig gesetztes Cookie (siehe api/fan/favoriten-cookie):
// überlebt die ~7-Tage-Löschung von localStorage in Safari/iOS. Best effort.
function spiegleInCookie(f: Favoriten): void {
  void fetch("/api/fan/favoriten-cookie", {
    method: "POST",
    body: JSON.stringify(f),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

// Einmal beim Start der App: Sind lokal Favoriten da, werden sie ins Cookie
// gespiegelt (auch für bestehende Nutzer); ist localStorage leer (z.B. von
// iOS gelöscht), kommen sie aus dem Cookie zurück.
export async function gleicheFavoritenMitCookieAb(): Promise<void> {
  try {
    const lokal = lies();
    if (lokal.vereine.length > 0 || lokal.mannschaften.length > 0) {
      spiegleInCookie(lokal);
      return;
    }
    const antwort = await fetch("/api/fan/favoriten-cookie", { credentials: "same-origin", cache: "no-store" });
    if (!antwort.ok) return;
    const daten = parseFavoriten(JSON.stringify(await antwort.json()));
    if (daten.vereine.length === 0 && daten.mannschaften.length === 0) return;
    localStorage.setItem(KEY, JSON.stringify(daten));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // kein localStorage/Netz — Favoriten bleiben wie sie sind
  }
}
