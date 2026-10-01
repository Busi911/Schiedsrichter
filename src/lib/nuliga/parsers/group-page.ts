import {
  ersteH1,
  metaInhalt,
  normalisiereSpaltenkopf,
  paramsAusUrl,
  parseDoppelwert,
  tabellen,
  zeilen,
  zellen,
} from "../html";
import { parseLigaName } from "../normalisierung";
import type { GruppenSeite, ParseErgebnis, TabellenZeile } from "../types";
import { parseSpielTabellen } from "./spielzeilen";

// groupPage: Kopf (<h1>: Wettbewerb / Liga / Ansicht), Tabelle (Spaltenköpfe
// Rang, Mannschaft, Begegnungen, S, U, N, Tore, +/-, Punkte) und der
// Spielplan. Die Teamzellen verlinken auf teamPortrait?teamtable=<id> — so
// bekommen wir die teamtable-IDs ALLER Teams der Gruppe in einem Request.
// Der "Spielplan (Aktuell)" ist nur ein Ausschnitt; der volle Saisonplan
// kommt aus dem teamPortrait.
export function parseGroupPage(html: string): ParseErgebnis<GruppenSeite> {
  const warnungen: string[] = [];

  const statsUrl = metaInhalt(html, "nuLigaStatsUrl");
  const params = statsUrl ? paramsAusUrl(statsUrl) : null;
  const h1 = ersteH1(html);
  const liga = h1[1] ? parseLigaName(h1[1]) : null;

  const tabelle: TabellenZeile[] = [];
  for (const t of tabellen(html)) {
    const alle = zeilen(t);
    const kopfZeile = alle.find((z) => /<th\b/i.test(z));
    if (!kopfZeile) continue;
    const kopf = zellen(kopfZeile).map((c) => normalisiereSpaltenkopf(c.text));
    const idx = {
      rang: kopf.indexOf("rang"),
      mannschaft: kopf.indexOf("mannschaft"),
      begegnungen: kopf.indexOf("begegnungen"),
      s: kopf.indexOf("s"),
      u: kopf.indexOf("u"),
      n: kopf.indexOf("n"),
      tore: kopf.indexOf("tore"),
      punkte: kopf.indexOf("punkte"),
    };
    if (idx.rang < 0 || idx.mannschaft < 0) continue;

    for (const zeile of alle) {
      if (/<th\b/i.test(zeile)) continue;
      const z = zellen(zeile);
      const rang = Number(z[idx.rang]?.text);
      const name = z[idx.mannschaft]?.text;
      if (!Number.isInteger(rang) || !name) continue;

      const anker = z[idx.mannschaft].html.match(/<a\b[^>]*href\s*=\s*"([^"]*)"/i);
      const zahl = (i: number) => {
        const w = i >= 0 ? z[i]?.text : "";
        return /^\d+$/.test(w ?? "") ? Number(w) : null;
      };
      tabelle.push({
        rang,
        mannschaft: name,
        teamtableId: anker ? (paramsAusUrl(anker[1]).get("teamtable") ?? null) : null,
        spiele: zahl(idx.begegnungen),
        siege: zahl(idx.s),
        unentschieden: zahl(idx.u),
        niederlagen: zahl(idx.n),
        tore: idx.tore >= 0 ? parseDoppelwert(z[idx.tore]?.text ?? "") : null,
        punkte: idx.punkte >= 0 ? parseDoppelwert(z[idx.punkte]?.text ?? "") : null,
        zurueckgezogen: /zurückgezogen/i.test(z.map((c) => c.text).join(" ")),
      });
    }
  }

  const { spiele, warnungen: spielWarnungen } = parseSpielTabellen(html);
  warnungen.push(...spielWarnungen);

  if (!params?.get("group")) warnungen.push("Keine Gruppen-ID in den Seiten-Metadaten");
  if (!liga) warnungen.push("Kein Liga-Name in der Überschrift gefunden");
  if (tabelle.length === 0) warnungen.push("Keine Tabelle gefunden");

  return {
    daten: {
      championship: params?.get("championship") ?? null,
      gruppenId: params?.get("group") ?? null,
      liga,
      tabelle,
      spiele,
    },
    warnungen,
  };
}
