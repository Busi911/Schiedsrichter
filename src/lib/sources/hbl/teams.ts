import type { HblAbfrage, HblEndpunkte, HblParser, HblTeam, HoleHbl } from "./types";

// Teams einer Liga (Teamübersicht). Identität ist die UUID, nie der Name; Logo-URLs stammen aus dem HTML und nur von erlaubten Hosts.
export async function holeTeams(hole: HoleHbl, ep: HblEndpunkte, parser: HblParser, a: HblAbfrage): Promise<HblTeam[]> {
  if (a.wettbewerb !== "hbl1" && a.wettbewerb !== "hbl2") throw new Error(`HBL: ${a.wettbewerb} hat noch keine Teamübersicht`);
  const teams = parser.teams(await hole(ep.teams(a)), { league: a.wettbewerb });
  return [...new Map(teams.map((t) => [t.externalId, t])).values()];
}
