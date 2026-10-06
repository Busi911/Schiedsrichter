import "server-only";
import type { LiveSpielstand } from "@/lib/match-provider";
import { holeSportDeSeite } from "./client";
import { parseLivetickerHtml } from "./live-parser";
import type { SportDeLiveStand } from "./types";
import { livetickerPfad } from "./urls";

// Live-Stand aus der Liveticker-Seite mit kurzem Zwischenspeicher je Instanz: egal wie viele Besucher dasselbe Spiel ansehen, wird sport.de je
// Spiel höchstens alle 10 Sekunden (laufend), 25 Sekunden (Halbzeit) bzw. 2 Minuten (vor dem Anwurf) abgefragt; parallele Anfragen teilen sich
// einen Abruf. Nach "Beendet" wird nicht mehr abgefragt (der Sync übernimmt das Endergebnis).
const MAX_EINTRAEGE = 200;

type Eintrag = { bis: number; wert: Promise<SportDeLiveStand | null> };
const speicher = new Map<string, Eintrag>();

export function ttlFuerStatus(status: SportDeLiveStand["status"] | undefined): number {
  if (status === "live") return 10_000;
  if (status === "halftime") return 25_000;
  if (status === "finished") return 10 * 60_000;
  return 120_000; // geplant/unbekannt
}

export async function holeSportDeLive(externalMatchId: string, matchPfad: string, jetzt = Date.now()): Promise<SportDeLiveStand | null> {
  const vorhanden = speicher.get(externalMatchId);
  if (vorhanden && vorhanden.bis > jetzt) return vorhanden.wert;
  const wert = holeSportDeSeite(livetickerPfad(matchPfad))
    .then((html) => parseLivetickerHtml(html, externalMatchId))
    .catch(() => null);
  // TTL richtet sich nach dem zuletzt bekannten Status: erst nach dem Abruf bekannt, daher kurz vorläufig und dann verlängert.
  const eintrag: Eintrag = { bis: jetzt + 10_000, wert };
  speicher.set(externalMatchId, eintrag);
  void wert.then((stand) => {
    eintrag.bis = jetzt + ttlFuerStatus(stand?.status);
  });
  if (speicher.size > MAX_EINTRAEGE) {
    for (const [k, v] of speicher) if (v.bis <= jetzt) speicher.delete(k);
  }
  return wert;
}

// Für die Anzeige im match-provider-Format.
export function alsLiveSpielstand(s: SportDeLiveStand, jetzt = new Date()): LiveSpielstand | null {
  if (s.homeScore === null || s.awayScore === null) return null;
  const status = s.status;
  if (status !== "scheduled" && status !== "live" && status !== "halftime" && status !== "finished") return null;
  return { status, heimTore: s.homeScore, gastTore: s.awayScore, spielzeit: s.minute !== null ? `${s.minute}'` : undefined, aktualisiertAm: jetzt };
}
