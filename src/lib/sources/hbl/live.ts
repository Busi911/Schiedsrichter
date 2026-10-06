import type { LiveSpielstand } from "@/lib/match-provider";
import type { HblEndpunkte, HblParser, HoleHbl } from "./types";

// Einfacher Live-Stand aus der öffentlichen Spielseite (…/de/match/<UUID>): Status und Tore. Ereignisse (Tore, Zeitstrafen,
// Paraden …) und die Spielzeit folgen später, sobald eine strukturierte öffentliche Quelle bekannt ist.
export async function holeLiveStand(
  hole: HoleHbl,
  ep: HblEndpunkte,
  parser: HblParser,
  externalMatchId: string,
  jetzt = new Date()
): Promise<LiveSpielstand | null> {
  const stand = parser.spiel(await hole(ep.spiel(externalMatchId)), externalMatchId);
  if (!stand || stand.homeScore === null || stand.awayScore === null) return null;
  const status = stand.status;
  if (status !== "scheduled" && status !== "live" && status !== "halftime" && status !== "finished") return null;
  return { status, heimTore: stand.homeScore, gastTore: stand.awayScore, aktualisiertAm: jetzt };
}
