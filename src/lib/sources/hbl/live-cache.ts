import "server-only";
import type { LiveSpielstand } from "@/lib/match-provider";
import { holeHblSeite } from "./client";
import { holeLiveStand } from "./live";
import { HBL_ENDPUNKTE, hblParser } from "./parser";

// Live-Stand aus der öffentlichen Spielseite mit kurzem Zwischenspeicher je Instanz: egal wie viele Besucher dasselbe Spiel
// ansehen, die HBL-Seite wird je Spiel höchstens alle 10 Sekunden abgefragt; parallele Anfragen teilen sich einen Abruf.
const TTL_MS = 10_000;
const MAX_EINTRAEGE = 200;

type Eintrag = { bis: number; wert: Promise<LiveSpielstand | null> };
const speicher = new Map<string, Eintrag>();

export function holeHblLiveGecacht(externalMatchId: string, jetzt = Date.now()): Promise<LiveSpielstand | null> {
  const vorhanden = speicher.get(externalMatchId);
  if (vorhanden && vorhanden.bis > jetzt) return vorhanden.wert;
  const wert = holeLiveStand(holeHblSeite, HBL_ENDPUNKTE, hblParser, externalMatchId).catch(() => null);
  speicher.set(externalMatchId, { bis: jetzt + TTL_MS, wert });
  if (speicher.size > MAX_EINTRAEGE) {
    for (const [k, v] of speicher) if (v.bis <= jetzt) speicher.delete(k);
  }
  return wert;
}
