import "server-only";
import { maskierePersonendaten } from "@/lib/bildtyp";
import { saisonLabel } from "@/lib/saison";
import { BUNDESLIGEN, type BundesLiga } from "../match";
import { alleMit, attr, parseHtml, textInhalt } from "../spieltag/html";
import { holeNdrSeite } from "./client";
import { parseNdrSeite } from "./parser";
import { NDR_BASIS, spieltagPfad } from "./urls";

// Testimport/Diagnose der ndr.de-Seiten (nur Systemadmin, SCHREIBT NICHTS): Abruf, was der Parser erkennt (Spiele, Teams, aktueller Spieltag,
// Tabellenzeilen, Parsingfehler), Link-Formen, Bild-Hosts und maskierte HTML-Auszüge. Die Parser sind aus der Beschreibung gebaut und gegen
// nachgebaute Fixtures geprüft — hier zeigt sich, ob sie zur echten Seite passen.

export type SeitenDiagnose = {
  name: string;
  pfad: string;
  url: string;
  ms: number;
  zeichen: number | null;
  fehler: string | null;
  ergebnis: string[];
  roh: string[];
  auszuege: { titel: string; html: string }[];
};

const auszug = (html: string, index: number, vor = 200, nach = 1200) => maskierePersonendaten(html.slice(Math.max(0, index - vor), index + nach));

export async function diagnostiziereNdr(liga: BundesLiga, spieltag = 1, jetzt = new Date()): Promise<SeitenDiagnose[]> {
  const saison = saisonLabel(jetzt);
  const pfad = spieltagPfad(liga, spieltag, Number(saison.slice(0, 4)));
  const d: SeitenDiagnose = { name: `${BUNDESLIGEN[liga].kurz} (Spieltag ${spieltag})`, pfad, url: `${NDR_BASIS}${pfad}`, ms: 0, zeichen: null, fehler: null, ergebnis: [], roh: [], auszuege: [] };
  const start = Date.now();
  try {
    const html = await holeNdrSeite(pfad);
    d.zeichen = html.length;
    const wurzel = parseHtml(html);
    const hrefs = alleMit(wurzel, "a").map((a) => attr(a, "href") ?? "");
    const hosts = new Map<string, number>();
    for (const m of html.matchAll(/<img\b[^>]*?(?:src|data-src)\s*=\s*["']([^"']+)["']/gi)) {
      try {
        const h = new URL(m[1], NDR_BASIS).hostname;
        hosts.set(h, (hosts.get(h) ?? 0) + 1);
      } catch {
        // ungültig
      }
    }
    d.roh.push(`Bild-Hosts: ${[...hosts].map(([h, n]) => `${h} (${n}×)`).join(", ") || "keine Bilder"}`);
    d.roh.push(`Überschriften „N. Spieltag“ im Text: ${(textInhalt(wurzel).match(/\b\d{1,2}\.\s*Spieltag\b/g) ?? []).length}× · „Tabelle“: ${(html.match(/Tabelle/g) ?? []).length}×`);
    const spieltagLinks = hrefs.filter((h) => /_matchDay-\d+/i.test(h));
    d.roh.push(`Spieltag-Links (_matchDay-…): ${spieltagLinks.length ? [...new Set(spieltagLinks)].slice(0, 6).join(" · ") : "keine"}`);
    const h = /\d{1,2}\.\s*Spieltag/.exec(html);
    if (h) d.auszuege.push({ titel: "Um die erste Überschrift „N. Spieltag“", html: auszug(html, h.index) });
    const t = /Platz[\s\S]{0,300}?Punkte/.exec(html);
    if (t) d.auszuege.push({ titel: "Um den Tabellenkopf (Platz … Punkte)", html: auszug(html, t.index, 300, 1600) });
    try {
      const r = parseNdrSeite(html, { liga, saison, jetzt });
      const tab = [...r.tabellen].map(([n, z]) => `Tabelle ${n ?? "?"}. Spieltag: ${z.length} Zeilen`);
      d.ergebnis = [
        `${r.spiele.length} Spiele, ${r.teams.length} Teams, Spieltage auf der Seite: ${r.spieltage.length ? `${r.spieltage[0]}–${r.spieltage.at(-1)} (${r.spieltage.length})` : "—"}, aktueller Spieltag (letztes Ergebnis): ${r.aktuellerSpieltag ?? "—"}`,
        tab.join(" · ") || "keine Tabelle erkannt",
        ...r.spiele.slice(0, 5).map((s) => `${s.spieltag}. ST · ${s.datum ?? "?"} ${s.uhrzeit ?? ""} · ${s.home.name} ${s.homeScore ?? "-"}:${s.awayScore ?? "-"} ${s.away.name}${s.halftimeHomeScore !== null ? ` · HZ ${s.halftimeHomeScore}:${s.halftimeAwayScore}` : ""} · ${s.status ?? "?"}`),
        ...[...r.tabellen.values()].slice(0, 1).flatMap((z) => z.slice(0, 3).map((x) => `${x.rang}. ${x.name} · ${x.spiele} Sp. ${x.siege}/${x.unentschieden}/${x.niederlagen} · ${x.torePlus}:${x.toreMinus} (${x.tordifferenz}) · ${x.punkteRoh}`)),
        `Navigation: ${r.navigation.map((n) => n.spieltag).join(", ") || "keine Spieltag-Links"}`,
        ...r.warnungen.slice(0, 6).map((w) => `Warnung: ${w}`),
      ];
    } catch (err) {
      d.fehler = `Parser: ${err instanceof Error ? err.message : String(err)}`;
      d.auszuege.push({ titel: "Sichtbarer Text (Anfang)", html: maskierePersonendaten(textInhalt(wurzel).slice(0, 1500)) });
    }
  } catch (err) {
    d.fehler = `Abruf: ${err instanceof Error ? err.message : String(err)}`;
  }
  d.ms = Date.now() - start;
  return [d];
}
