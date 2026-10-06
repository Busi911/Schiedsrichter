import { attribut, paramsAusUrl, textVon } from "../html";
import type { ParseErgebnis, VereinsSucheEintrag, VereinsSucheRegion, VereinsSucheSeite } from "../types";

// clubSearch: Die Startseite listet die Bezirke (Links mit regionName=), jede Bezirksseite die Vereine
// (Links auf clubInfoDisplay?club=<interne ID>). NICHT über Tabellenpositionen, sondern über die
// Links selbst: jeder Anker mit club=-Parameter ist ein Verein, jeder mit regionName= ein Bezirk.
// Die sichtbare Vereinsnummer steht in Klammern hinter dem Namen ("HSG Linden (14194)") oder in einer
// Nachbarzelle der Zeile; sie wird getrennt von der club-ID geführt.
export function parseVereinsuche(html: string, bezirk: string | null = null): ParseErgebnis<VereinsSucheSeite> {
  const warnungen: string[] = [];
  const vereine = new Map<string, VereinsSucheEintrag>();
  const regionen = new Map<string, VereinsSucheRegion>();

  for (const treffer of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attribut(`<a ${treffer[1]}>`, "href");
    if (!href) continue;
    const params = paramsAusUrl(href);

    if (/clubInfoDisplay|clubTeams|clubPortrait/i.test(href) && /^\d+$/.test(params.get("club") ?? "")) {
      const clubId = params.get("club")!;
      let text = textVon(treffer[2]);
      let nummer: string | null = null;
      const klammer = text.match(/\((\d{3,7})\)\s*$/);
      if (klammer) {
        nummer = klammer[1];
        text = text.slice(0, klammer.index).trim();
      }
      if (!nummer) {
        // Nummer in einer Nachbarzelle derselben Zeile ("14194" allein).
        const zeile = zeileUm(html, treffer.index ?? 0);
        const zahl = zeile?.match(/<td\b[^>]*>\s*(\d{3,7})\s*<\/td>/i);
        if (zahl) nummer = zahl[1];
      }
      if (!text) continue;
      if (!vereine.has(clubId)) vereine.set(clubId, { clubId, name: text, nummer, bezirk });
      continue;
    }

    const region = params.get("regionName");
    if (region && /clubSearch/i.test(href)) {
      const name = region.trim();
      if (name && !regionen.has(name)) regionen.set(name, { name, searchPattern: params.get("searchPattern") });
    }
  }

  if (vereine.size === 0 && regionen.size === 0) {
    warnungen.push("Weder Vereine noch Bezirke gefunden (HTML-Struktur geändert?)");
  }
  return { daten: { vereine: [...vereine.values()], regionen: [...regionen.values()] }, warnungen };
}

function zeileUm(html: string, position: number): string | null {
  const start = html.lastIndexOf("<tr", position);
  const ende = html.indexOf("</tr>", position);
  return start >= 0 && ende > start ? html.slice(start, ende) : null;
}
