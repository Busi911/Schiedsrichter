import { ersteH1, metaInhalt, paramsAusUrl, textVon } from "../html";
import type { NuligaSpiel, ParseErgebnis } from "../types";
import { parseSpielTabellen } from "./spielzeilen";

// groupPage eines Freundschaftsspiels/Turniers ("… FS 26/27"): jedes Spiel ist
// eine eigene Mini-Gruppe. Statt der Tabelle gibt es "Teilnehmende
// Mannschaften" (Links auf teamPortrait?teamtable=<id>) und den Spielplan mit
// dem einen Spiel (Spielnummer "0", Halle, Ergebnis mit Spielbericht-Link).
//
// DATENSCHUTZ: wie bei den übrigen Parsern nur die Whitelist unten; die
// Spielzeilen laufen über parseSpielTabellen (liest keine Schiedsrichter).
export type FreundschaftsGruppe = {
  championship: string | null;
  gruppenId: string | null;
  titel: string | null; // z.B. "Freundschaftsspiel 2026-08-29 M TSF Heuchelheim (BOL) gg TV Altenhaßlau (BOL)"
  teams: { name: string; teamtableId: string }[];
  spiele: NuligaSpiel[];
};

export function parseFreundschaftsGruppe(html: string): ParseErgebnis<FreundschaftsGruppe> {
  const warnungen: string[] = [];
  const params = (() => {
    const url = metaInhalt(html, "nuLigaStatsUrl");
    return url ? paramsAusUrl(url) : null;
  })();
  const h1 = ersteH1(html);

  const teams: FreundschaftsGruppe["teams"] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*"([^"]*teamPortrait[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = paramsAusUrl(m[1].replace(/&amp;/g, "&")).get("teamtable");
    const name = textVon(m[2]);
    if (id && name && !teams.some((t) => t.teamtableId === id)) teams.push({ name, teamtableId: id });
  }

  const { spiele, warnungen: spielWarnungen } = parseSpielTabellen(html);
  warnungen.push(...spielWarnungen);
  if (teams.length === 0) warnungen.push("Keine teilnehmenden Mannschaften gefunden");
  if (spiele.length === 0) warnungen.push("Kein Spiel gefunden");

  return {
    daten: {
      championship: params?.get("championship") ?? null,
      gruppenId: params?.get("group") ?? null,
      titel: h1[1] ?? null,
      teams,
      spiele,
    },
    warnungen,
  };
}
