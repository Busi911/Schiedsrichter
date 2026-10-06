import type { HblAbfrage, HblEndpunkte, HblParser, HblSpiel, HblTeamRef, HoleHbl } from "./types";

// Spielplan einer Liga. Primärer Schlüssel ist die Spiel-UUID aus dem Spiel-Link; doppelte UUIDs zählen einmal.
export async function holeSpielplan(
  hole: HoleHbl,
  ep: HblEndpunkte,
  parser: HblParser,
  a: HblAbfrage,
  teams: HblTeamRef[]
): Promise<{ spiele: HblSpiel[]; warnungen: string[] }> {
  const { spiele, warnungen } = parser.spielplan(await hole(ep.spielplan(a)), { teams });
  return { spiele: [...new Map(spiele.map((s) => [s.externalMatchId, s])).values()], warnungen };
}
