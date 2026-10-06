import "server-only";
import { maskierePersonendaten } from "@/lib/bildtyp";
import { SPORTDE_LIGEN, type SportDeLiga } from "../match";
import { holeSportDeSeite, pruefeSportDeZugriff } from "./client";
import { alleMit, attr, parseHtml, textInhalt } from "./html";
import { parseLivetickerHtml } from "./live-parser";
import { parseSpielUebersichtHtml } from "./match-parser";
import { parseSpieltagSeite } from "./schedule-parser";
import { SPORTDE_BASIS, livetickerPfad, matchLinkAusHref, spieltagPfad, uebersichtPfad } from "./urls";
import { saisonLabel } from "@/lib/saison";

// Diagnose der sport.de-Seiten (nur Systemadmin, schreibt nichts): je Seite Abruf, Größe, was der Parser erkennt, Link-Muster, Bild-Hosts und
// maskierte HTML-Auszüge. Die Parser sind aus der Beschreibung gebaut und gegen nachgebaute Fixtures geprüft — hier zeigt sich, ob sie zur
// echten Seite passen. Auszüge enthalten nur öffentliche Seitenstruktur (E-Mail/Telefon werden trotzdem maskiert).

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

const zeigen = (html: string, index: number, vor = 250, nach = 800) => maskierePersonendaten(html.slice(Math.max(0, index - vor), index + nach));

// Welche Link-Formen gibt es? (Zahlen und Match-IDs durch Platzhalter ersetzt) — zeigt, wie Team- und Spiel-Links aufgebaut sind.
export function linkMuster(html: string): string[] {
  const zaehler = new Map<string, { n: number; beispiel: string }>();
  for (const a of alleMit(parseHtml(html), "a")) {
    const href = attr(a, "href");
    if (!href || !/^(https?:\/\/(www\.)?sport\.de)?\/handball\//i.test(href)) continue;
    const pfad = href.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
    const form = pfad.replace(/ma\d+/g, "ma#").replace(/\/md\d+\//g, "/md#/").replace(/\d+/g, "#").split("/").map((t, i) => (i >= 3 && t.length > 14 ? "<slug>" : t)).join("/");
    const z = zaehler.get(form) ?? { n: 0, beispiel: pfad };
    z.n++;
    zaehler.set(form, z);
  }
  return [...zaehler].sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([form, z]) => `${z.n}× ${form}  (z.B. ${z.beispiel})`);
}

export function bildHosts(html: string): string[] {
  const hosts = new Map<string, number>();
  for (const m of html.matchAll(/<img\b[^>]*?(?:src|data-src)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], SPORTDE_BASIS);
      hosts.set(u.hostname, (hosts.get(u.hostname) ?? 0) + 1);
    } catch {
      // ungültig
    }
  }
  return [...hosts].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} (${n}×)`);
}

async function seite(name: string, pfad: string, pruefe: (html: string) => { ergebnis: string[]; auszuege?: SeitenDiagnose["auszuege"] }): Promise<SeitenDiagnose> {
  const start = Date.now();
  const d: SeitenDiagnose = { name, pfad, url: `${SPORTDE_BASIS}${pfad}`, ms: 0, zeichen: null, fehler: null, ergebnis: [], roh: [], auszuege: [] };
  try {
    const html = await holeSportDeSeite(pfad);
    d.zeichen = html.length;
    d.roh.push(`Link-Formen: ${linkMuster(html).join(" || ") || "keine /handball/-Links"}`);
    d.roh.push(`Bild-Hosts: ${bildHosts(html).join(", ") || "keine Bilder"}`);
    const mitMa = /\/ma\d+\//.test(html);
    d.roh.push(`Match-Links (/ma…/) im HTML: ${mitMa ? "ja" : "NEIN"} · "Beendet": ${(html.match(/Beendet/g) ?? []).length}× · "Spielort": ${(html.match(/Spielort/g) ?? []).length}×`);
    const m = /\/ma\d+\//.exec(html);
    if (m) d.auszuege.push({ titel: "Um den ersten Match-Link", html: zeigen(html, m.index) });
    const t = /(?:Sp\.|Spiele)[\s\S]{0,200}?Tore/.exec(html);
    if (t) d.auszuege.push({ titel: "Um den Tabellenkopf (Sp. … Tore)", html: zeigen(html, t.index, 400, 1400) });
    try {
      const r = pruefe(html);
      d.ergebnis = r.ergebnis;
      d.auszuege.push(...(r.auszuege ?? []));
    } catch (err) {
      d.fehler = `Parser: ${err instanceof Error ? err.message : String(err)}`;
      d.auszuege.push({ titel: "Sichtbarer Text (Anfang)", html: maskierePersonendaten(textInhalt(parseHtml(html)).slice(0, 1500)) });
    }
  } catch (err) {
    d.fehler = `Abruf: ${err instanceof Error ? err.message : String(err)}`;
  }
  d.ms = Date.now() - start;
  return d;
}

export async function diagnostiziereSpieltag(liga: SportDeLiga, spieltag = 1, jetzt = new Date()): Promise<SeitenDiagnose[]> {
  const saison = saisonLabel(jetzt);
  return [
    await seite(`${SPORTDE_LIGEN[liga].kurz} Spieltag ${spieltag}`, spieltagPfad(liga, spieltag), (html) => {
      const r = parseSpieltagSeite(html, { liga, saison, spieltag });
      return {
        ergebnis: [
          `${r.spiele.length} Spiele, ${r.tabelle.length} Tabellenzeilen, ${r.teams.length} Teams`,
          ...r.spiele.slice(0, 4).map((s) => `${s.externalMatchId} · ${s.datum ?? "?"} ${s.uhrzeit ?? ""} · ${s.home.name} ${s.homeScore ?? "-"}:${s.awayScore ?? "-"} ${s.away.name} · ${s.status ?? "geplant/unbekannt"}${s.halftimeHomeScore !== null ? ` · HZ ${s.halftimeHomeScore}:${s.halftimeAwayScore}` : ""} · ${s.matchPfad}`),
          ...r.tabelle.slice(0, 3).map((z) => `${z.rang}. ${z.name} (${z.teamId}) · ${z.spiele} Sp. ${z.siege}/${z.unentschieden}/${z.niederlagen} · ${z.torePlus}:${z.toreMinus} (${z.tordifferenz}) · ${z.punkteRoh}`),
          ...r.warnungen.slice(0, 4),
        ],
      };
    }),
  ];
}

// Spielübersicht und Liveticker eines Spiels (Verzeichnis wie /handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/)
export async function diagnostiziereSpiel(matchPfad: string, jetzt = new Date()): Promise<SeitenDiagnose[]> {
  const link = matchLinkAusHref(matchPfad);
  if (!link) return [{ name: "Spiel", pfad: matchPfad, url: matchPfad, ms: 0, zeichen: null, fehler: "Kein gültiger Spiel-Pfad (…/ma<ID>/…)", ergebnis: [], roh: [], auszuege: [] }];
  const liga = link.ligaPfad.includes("2-hbl") ? "hbl2" : "hbl1";
  const saison = saisonLabel(jetzt);
  return [
    await seite("Spielübersicht", uebersichtPfad(link.pfad), (html) => {
      const s = parseSpielUebersichtHtml(html, { liga, saison, externalMatchId: link.externalMatchId, pfad: link.pfad });
      return { ergebnis: [`${s.home.name} ${s.homeScore ?? "-"}:${s.awayScore ?? "-"} ${s.away.name} · Status ${s.status ?? "?"} · HZ ${s.halftimeHomeScore ?? "-"}:${s.halftimeAwayScore ?? "-"} · Spieltag ${s.spieltag ?? "?"} · ${s.datum ?? "?"} ${s.uhrzeit ?? ""}`, `Spielort: ${s.venue ?? "—"} · Ort: ${s.ort ?? "—"}`] };
    }),
    await seite("Liveticker", livetickerPfad(link.pfad), (html) => {
      const l = parseLivetickerHtml(html, link.externalMatchId);
      return { ergebnis: [`Status ${l.status ?? "?"} (${l.statusText ?? "—"}) · Minute ${l.minute ?? "—"} · ${l.homeScore ?? "-"}:${l.awayScore ?? "-"} · HZ ${l.halftimeHomeScore ?? "-"}:${l.halftimeAwayScore ?? "-"}`, `${l.events.length} Ereignisse`, ...l.events.slice(0, 5).map((e) => `${e.minute}' ${e.type}${e.team ? ` (${e.team})` : ""}${e.homeScore !== undefined ? ` ${e.homeScore}:${e.awayScore}` : ""}`)] };
    }),
  ];
}

// Zugriffsprüfung: Was sagt sport.de zu automatisierten Abrufen (robots.txt) und wie antwortet es auf eine Spieltagsseite? Hilft bei 403/429.
export async function pruefeZugriff(liga: SportDeLiga): Promise<{ robots: { status: number; text: string } | null; seite: { status: number; header: Record<string, string>; text: string } | null; fehler: string | null }> {
  try {
    const robots = await pruefeSportDeZugriff("/robots.txt").then((r) => ({ status: r.status, text: r.text }));
    const seite = await pruefeSportDeZugriff(spieltagPfad(liga, 1));
    return { robots, seite: { ...seite, text: maskierePersonendaten(seite.text.slice(0, 600)) }, fehler: null };
  } catch (err) {
    return { robots: null, seite: null, fehler: err instanceof Error ? err.message : String(err) };
  }
}
