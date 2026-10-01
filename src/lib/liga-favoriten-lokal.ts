"use client";

import { useSyncExternalStore } from "react";

// Favoriten der öffentlichen Seiten liegen NUR im Browser (localStorage) —
// kein Konto nötig. Gespeichert werden ausschließlich die (öffentlichen)
// IDs von Verein/Mannschaft. Jeder Zugriff ist in try/catch, weil
// localStorage in privaten Fenstern/bei blockierten Daten fehlen oder
// werfen kann; die Seiten funktionieren dann ohne Favoriten weiter.

export type Favoriten = { vereine: string[]; mannschaften: string[] };

const KEY = "hp_favoriten_v1";
const EVENT = "hp-favoriten-geaendert";
const MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LEER: Favoriten = Object.freeze({ vereine: [], mannschaften: [] }) as Favoriten;

function bereinige(liste: unknown): string[] {
  if (!Array.isArray(liste)) return [];
  return [...new Set(liste.filter((x): x is string => typeof x === "string" && UUID.test(x)))].slice(0, MAX);
}

// Rein (testbar): robustes Lesen, auch bei kaputtem/manipuliertem Inhalt.
export function parseFavoriten(raw: string | null): Favoriten {
  if (!raw) return LEER;
  try {
    const daten = JSON.parse(raw) as Partial<Favoriten>;
    return { vereine: bereinige(daten.vereine), mannschaften: bereinige(daten.mannschaften) };
  } catch {
    return LEER;
  }
}

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
  // Browser bitten, die Daten nicht automatisch aufzuräumen (wirkt v.a. in
  // Chrome/Firefox; best effort, Fehler sind unkritisch).
  void navigator.storage?.persist?.().catch(() => {});
}
