import {
  ersteH1,
  metaInhalt,
  normalisiereSpaltenkopf,
  paramsAusUrl,
  parseDoppelwert,
  zeilen,
  zellen,
  textVon,
} from "../html";
import { istRegulaererWettbewerb, saisonAusChampionship } from "../normalisierung";
import type { ClubTeamEintrag, ClubTeamsSeite, ParseErgebnis } from "../types";

// clubTeams?club=<id>: je Wettbewerb ein <h2>-Abschnitt mit einer Tabelle
// (Mannschaft | Liga | Mannschaftsverantwortlicher | Tab.-Rang | Punkte).
//
// DATENSCHUTZ: Die Spalte "Mannschaftsverantwortlicher" enthält Klarnamen.
// Sie wird nie gelesen — es werden nur die Spalten per Kopfzeile gezogen,
// die ausdrücklich unten genannt sind.
export function parseClubTeams(html: string): ParseErgebnis<ClubTeamsSeite> {
  const warnungen: string[] = [];
  const teams: ClubTeamEintrag[] = [];

  const statsUrl = metaInhalt(html, "nuLigaStatsUrl");
  const clubId = statsUrl ? paramsAusUrl(statsUrl).get("club") : null;
  const vereinsname = ersteH1(html)[0] ?? null;

  let abschnitt = "";
  let spalten: { mannschaft: number; liga: number; rang: number; punkte: number } | null = null;

  for (const zeile of zeilen(html)) {
    const h2 = zeile.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2) {
      abschnitt = textVon(h2[1]);
      spalten = null;
      continue;
    }

    const z = zellen(zeile);
    if (z.length === 0) continue;

    if (z.every((c) => c.tag === "th")) {
      const kopf = z.map((c) => normalisiereSpaltenkopf(c.text));
      spalten = {
        mannschaft: kopf.indexOf("mannschaft"),
        liga: kopf.indexOf("liga"),
        rang: kopf.findIndex((k) => k.startsWith("tab.-rang")),
        punkte: kopf.indexOf("punkte"),
      };
      continue;
    }
    if (!spalten || spalten.mannschaft < 0 || spalten.liga < 0) continue;

    const ligaZelle = z[spalten.liga];
    const anker = ligaZelle?.html.match(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    const params = anker ? paramsAusUrl(anker[1]) : null;
    const championship = params?.get("championship");
    const gruppenId = params?.get("group");
    const mannschaftsname = z[spalten.mannschaft]?.text;

    if (!anker || !championship || !gruppenId || !mannschaftsname) {
      warnungen.push(`Zeile ohne Liga-Link/Mannschaft in Abschnitt "${abschnitt}" übersprungen`);
      continue;
    }

    const rangText = spalten.rang >= 0 ? z[spalten.rang]?.text : "";
    teams.push({
      abschnitt,
      championship,
      saison: saisonAusChampionship(championship),
      regulaer: istRegulaererWettbewerb(championship),
      gruppenId,
      mannschaftsname,
      ligaName: textVon(anker[2]),
      rang: /^\d+$/.test(rangText) ? Number(rangText) : null,
      punkte: spalten.punkte >= 0 ? parseDoppelwert(z[spalten.punkte]?.text ?? "") : null,
    });
  }

  if (teams.length === 0) {
    warnungen.push("Keine Mannschaften gefunden (HTML-Struktur geändert?)");
  } else if (!teams.some((t) => t.regulaer)) {
    warnungen.push("Kein regulärer Wettbewerb unter den Abschnitten gefunden");
  }

  return { daten: { vereinsname, clubId: clubId ?? null, teams }, warnungen };
}
