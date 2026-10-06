import { istErlaubteLogoUrl } from "./parser";
import type { HblAbfrage, HblEndpunkte, HblParser, HblTeam, HoleHbl } from "./types";

// Teams eines Wettbewerbs. Identität ist die UUID (externalId), nie der Name; Logo-URLs nur von erlaubten Hosts.
export async function holeTeams(hole: HoleHbl, ep: HblEndpunkte, parser: HblParser, a: HblAbfrage): Promise<HblTeam[]> {
  const teams = parser.teams(await hole(ep.teams(a)));
  const eindeutig = new Map<string, HblTeam>();
  for (const t of teams) {
    if (!t.externalId) continue;
    eindeutig.set(t.externalId, { ...t, logoUrl: istErlaubteLogoUrl(t.logoUrl) ? t.logoUrl : null });
  }
  return [...eindeutig.values()];
}
