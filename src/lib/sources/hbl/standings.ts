import type { HblAbfrage, HblEndpunkte, HblParser, HblTabellenzeile, HoleHbl } from "./types";

// Tabelle eines Wettbewerbs; null, wenn die Antwort keine Tabelle enthält (Pokal, Super Cup) oder unbrauchbar ist.
export async function holeTabelle(
  hole: HoleHbl,
  ep: HblEndpunkte,
  parser: HblParser,
  a: HblAbfrage
): Promise<HblTabellenzeile[] | null> {
  const zeilen = parser.tabelle(await hole(ep.tabelle(a)));
  if (!zeilen || zeilen.length === 0) return null;
  return [...new Map(zeilen.map((z) => [z.teamId, z])).values()].sort((x, y) => x.rang - y.rang);
}
