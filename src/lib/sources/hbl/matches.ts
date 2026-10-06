import type { HblAbfrage, HblEndpunkte, HblParser, HblSpiel, HoleHbl } from "./types";

// Spielplan eines Wettbewerbs. Primärer Schlüssel ist die Spiel-UUID; Spiele ohne UUID oder mit fehlendem
// Heim-/Gastteam werden verworfen, doppelte UUIDs zählen einmal (der letzte gilt).
export async function holeSpielplan(hole: HoleHbl, ep: HblEndpunkte, parser: HblParser, a: HblAbfrage): Promise<HblSpiel[]> {
  const spiele = parser.spielplan(await hole(ep.spielplan(a)));
  const eindeutig = new Map<string, HblSpiel>();
  for (const s of spiele) {
    if (!s.externalMatchId || !s.home.externalId || !s.away.externalId) continue;
    eindeutig.set(s.externalMatchId, s);
  }
  return [...eindeutig.values()];
}
