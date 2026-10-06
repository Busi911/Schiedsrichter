import type { HblAbfrage, HblEndpunkte, HblParser, HblTabellenzeile, HblTeamRef, HoleHbl } from "./types";

// Tabelle einer Liga, nach Platz sortiert; Zeilen werden über die UUID aus dem Team-Link (sonst über die Teamliste) zugeordnet.
export async function holeTabelle(
  hole: HoleHbl,
  ep: HblEndpunkte,
  parser: HblParser,
  a: HblAbfrage,
  teams: HblTeamRef[]
): Promise<{ zeilen: HblTabellenzeile[]; warnungen: string[] }> {
  const { zeilen, warnungen } = parser.tabelle(await hole(ep.tabelle(a)), { teams });
  return { zeilen: [...new Map(zeilen.map((z) => [z.teamId, z])).values()].sort((x, y) => x.rang - y.rang), warnungen };
}
