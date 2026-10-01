import { ersteH1, metaInhalt, paramsAusUrl, parseDoppelwert, tabellen, textVon } from "../html";
import { parseLigaName } from "../normalisierung";
import type { ParseErgebnis, TeamPortraitSeite } from "../types";
import { parseSpielTabellen } from "./spielzeilen";

// teamPortrait: IDs stehen in den Seiten-Metadaten (teamtable, group,
// championship, pageState), der Kopf (<h1>) hat drei Zeilen (Wettbewerb /
// Liga / Mannschaft, z.B. "TSF Heuchelheim 1. Männer"), die Tabellenzeile ist
// Freitext ("5. Platz 4:2 Punkte 91:83 Tore 2 Siege 0 Unentschieden 1
// Niederlagen") und der Spielplan umfasst die komplette Saison.
//
// Nicht gelesen werden: der Kalender-Link mit privatem Token
// (getTeamMeetingsWebcal) und die in manchen Zellen stehenden
// Schiedsrichter-Angaben (siehe spielzeilen.ts).
export function parseTeamPortrait(html: string): ParseErgebnis<TeamPortraitSeite> {
  const warnungen: string[] = [];

  const statsUrl = metaInhalt(html, "nuLigaStatsUrl");
  const params = statsUrl ? paramsAusUrl(statsUrl) : null;
  const h1 = ersteH1(html);

  const verein = html.match(
    /<a\b[^>]*href\s*=\s*"([^"]*clubInfoDisplay[^"]*)"[^>]*>([\s\S]*?)<\/a>/i
  );

  let tabellenstand: TeamPortraitSeite["tabellenstand"] = null;
  for (const t of tabellen(html)) {
    const text = textVon(t);
    const treffer = text.match(
      /(\d+)\.\s*Platz\s+(\d+:\d+)\s+Punkte\s+(\d+:\d+)\s+Tore\s+(\d+)\s+Siege\s+(\d+)\s+Unentschieden\s+(\d+)\s+Niederlagen/i
    );
    if (!treffer) continue;
    tabellenstand = {
      rang: Number(treffer[1]),
      punkte: parseDoppelwert(treffer[2])!,
      tore: parseDoppelwert(treffer[3])!,
      siege: Number(treffer[4]),
      unentschieden: Number(treffer[5]),
      niederlagen: Number(treffer[6]),
    };
    break;
  }

  const { spiele, warnungen: spielWarnungen } = parseSpielTabellen(html);
  warnungen.push(...spielWarnungen);

  if (!params?.get("teamtable")) warnungen.push("Keine teamtable-ID in den Seiten-Metadaten");
  if (spiele.length === 0) warnungen.push("Keine Spiele gefunden");

  return {
    daten: {
      championship: params?.get("championship") ?? null,
      gruppenId: params?.get("group") ?? null,
      teamtableId: params?.get("teamtable") ?? null,
      liga: h1[1] ? parseLigaName(h1[1]) : null,
      mannschaftsname: h1[2] ?? null,
      clubId: verein ? (paramsAusUrl(verein[1]).get("club") ?? null) : null,
      vereinsname: verein ? textVon(verein[2]) : null,
      tabellenstand,
      spiele,
    },
    warnungen,
  };
}
