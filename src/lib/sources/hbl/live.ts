import { mappeHblStatus } from "./parser";
import type { LiveSpielstand } from "@/lib/match-provider";
import type { HblEndpunkte, HblParser, HoleHbl } from "./types";

// Live-Stand eines Spiels für den Liveticker (match-provider). Ereignisse (Tore, Zeitstrafen, Paraden …) folgen später.
export async function holeLiveStand(
  hole: HoleHbl,
  ep: HblEndpunkte,
  parser: HblParser,
  externalMatchId: string,
  jetzt = new Date()
): Promise<LiveSpielstand | null> {
  const stand = parser.live(await hole(ep.live(externalMatchId)));
  if (!stand || stand.homeScore === null || stand.awayScore === null) return null;
  const status = mappeHblStatus(stand.status);
  if (status !== "scheduled" && status !== "live" && status !== "halftime" && status !== "finished") return null;
  return {
    status,
    heimTore: stand.homeScore,
    gastTore: stand.awayScore,
    spielzeit: stand.spielzeit ?? undefined,
    aktualisiertAm: jetzt,
  };
}
