import type { MatchStatus } from "../match";
import type { HblParser, SportradarStatus } from "./types";

// Reine Hilfen der HBL-Quelle: IDs aus öffentlichen Adressen, Statusmapping, Logo-Whitelist. Die Auswertung der
// Antworten selbst (`HblParser`) braucht die verifizierten Request-URLs und Beispielantworten — sie wird NICHT geraten.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// "/de/team/THW/febf038e-…" (auch mit Domain) -> { code: "THW", externalId: "febf038e-…" }
export function teamAusUrl(url: string): { code: string; externalId: string } | null {
  const m = url.match(new RegExp(`/team/([^/?#\\s]+)/(${UUID})(?=[/?#]|$)`, "i"));
  return m ? { code: m[1], externalId: m[2].toLowerCase() } : null;
}

// "/de/match/b1dc79f0-…" (auch mit Domain) -> UUID
export function matchIdAusUrl(url: string): string | null {
  const m = url.match(new RegExp(`/match/(${UUID})(?=[/?#]|$)`, "i"));
  return m ? m[1].toLowerCase() : null;
}

export const HBL_BASIS = "https://www.opel-hbl.de";

export function baueMatchUrl(externalMatchId: string): string {
  return `${HBL_BASIS}/de/match/${externalMatchId}`;
}

const STATUS_MAP: Record<SportradarStatus, MatchStatus> = {
  NOT_STARTED: "scheduled",
  FIRST_HALF: "live",
  SECOND_HALF: "live",
  FIRST_HALF_OT: "live",
  SECOND_HALF_OT: "live",
  PENALTY_SHOOTING: "live",
  // Pausen zwischen den Abschnitten: das Spiel läuft noch.
  AWAITING_OT: "live",
  AWAITING_PENALTIES: "live",
  HALFTIME: "halftime",
  OT_HALFTIME: "halftime",
  ENDED: "finished",
  AFTER_OT: "finished",
  AFTER_PENALTIES: "finished",
  INTERRUPTED: "interrupted",
  ABANDONED: "cancelled",
};

// Unbekannter/fehlender Zustand -> null (der Aufrufer behandelt es als geplant und meldet es).
export function mappeHblStatus(roh: string | null | undefined): MatchStatus | null {
  if (!roh) return null;
  return STATUS_MAP[roh.trim().toUpperCase() as SportradarStatus] ?? null;
}

export const ERLAUBTE_LOGO_HOSTS = ["images.dc.connect.sportradar.com"];

// Logo-URLs werden aus der öffentlichen HBL-Seite übernommen, aber nur von bekannten Hosts über https.
export function istErlaubteLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ERLAUBTE_LOGO_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export class HblNichtKonfiguriert extends Error {
  constructor(was: string) {
    super(`HBL-Quelle: ${was} ist noch nicht eingerichtet (verifizierte Request-URLs und Beispielantworten fehlen)`);
  }
}

// Platzhalter, bis der echte Parser vorliegt: jeder Aufruf meldet klar, was fehlt, statt Daten zu erfinden.
export function holeHblParser(): HblParser {
  const fehlt = (was: string) => (): never => {
    throw new HblNichtKonfiguriert(`Parser für ${was}`);
  };
  return { teams: fehlt("Teams"), spielplan: fehlt("Spielplan"), tabelle: fehlt("Tabelle"), live: fehlt("Live-Stand") };
}
