import "server-only";
import { maskierePersonendaten } from "@/lib/bildtyp";
import { HBL_BASIS, HBL_ENDPUNKTE, hblParser, matchIdAusUrl, teamAusUrl } from "./parser";
import { holeHblSeite, holeHblSkriptDatei } from "./client";
import { parseHtml, textInhalt, alleMit, attr } from "./html";
import type { HblWettbewerb } from "../match";

// Diagnose der öffentlichen HBL-Seiten (nur Systemadmin, schreibt nichts): je Seite Abruf, Größe, was der Parser daraus macht und
// Auszüge des HTML rund um die erkannten Anker. Gedacht, um die (nur aus der Beschreibung nachgebauten) Parser gegen die echte
// Seite zu prüfen — die Auszüge enthalten nur öffentliche Seitenstruktur (E-Mail/Telefon werden trotzdem maskiert).

export type SeitenDiagnose = {
  name: string;
  pfad: string;
  url: string;
  ms: number;
  zeichen: number | null;
  fehler: string | null;
  ergebnis: string[];
  auszuege: { titel: string; html: string }[];
  // Rohanalyse des unveränderten Quelltextes (inkl. Skripte): WO stehen die Daten, wenn nicht als Links im sichtbaren HTML?
  roh: { zeilen: string[]; auszuege: { titel: string; html: string }[] };
};

const zaehle = (html: string, muster: RegExp) => (html.match(muster) ?? []).length;

export function rohAnalyse(html: string): SeitenDiagnose["roh"] {
  const zeilen: string[] = [];
  const auszuege: { titel: string; html: string }[] = [];
  const marker: [string, RegExp][] = [
    ["/team/", /\/team\//g],
    ["/match/", /\/match\//g],
    ["UUID (8-4-4-4-12)", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi],
    ["febf038e (THW-UUID)", /febf038e/gi],
    ["__NUXT_DATA__", /__NUXT_DATA__/g],
    ["window.__NUXT__", /window\.__NUXT__/g],
    ["application/json", /application\/json/g],
    ["ld+json", /ld\+json/g],
    ["THW Kiel", /THW Kiel/g],
    ["sportradar", /sportradar/gi],
    ["Beendet", /Beendet/g],
  ];
  zeilen.push(marker.map(([n, r]) => `${n}: ${zaehle(html, r)}×`).join(" · "));

  // Skript-Tags: Kopf (Attribute) und Länge des Inhalts
  const skripte = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map((m) => ({ attrs: m[1].trim().slice(0, 140), laenge: m[2].length, inhalt: m[2] }));
  zeilen.push(`${skripte.length} Skript-Tags; die größten: ${[...skripte].sort((a, b) => b.laenge - a.laenge).slice(0, 5).map((x) => `[${x.attrs || "ohne Attribute"}] ${x.laenge} Zeichen`).join(" | ")}`);
  const gross = [...skripte].sort((a, b) => b.laenge - a.laenge)[0];
  if (gross && gross.laenge > 2000) auszuege.push({ titel: `Anfang des größten Skripts (${gross.laenge} Zeichen)`, html: maskierePersonendaten(gross.inhalt.slice(0, 1500)) });

  // Adressen und API-Pfade in allen Skripten (Konfiguration der Seite): hier steht, woher die Seite ihre Daten nachlädt.
  const alleSkripte = skripte.map((x) => x.inhalt).join("\n");
  const urls = new Set<string>();
  for (const m of alleSkripte.matchAll(/https?:\/\/[^\s"'\\<>)\],]+/g)) urls.add(m[0].replace(/[.,;]+$/, ""));
  for (const m of alleSkripte.matchAll(/["'](\/(?:api|_api|v\d|graphql|data|backend)[^"'\s\\]{0,120})["']/gi)) urls.add(m[1]);
  const ohneBilder = [...urls].filter((u) => !/\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|css)(\?|$)/i.test(u));
  zeilen.push(`Adressen/API-Pfade in Skripten (${ohneBilder.length}): ${ohneBilder.slice(0, 40).join(" | ") || "—"}`);
  const klein = skripte.filter((x) => x.laenge > 100 && x.laenge <= 3000 && !x.attrs.includes("src="));
  for (const k of klein.slice(0, 3)) auszuege.push({ titel: `Kleines Skript [${k.attrs || "ohne Attribute"}] (${k.laenge} Zeichen)`, html: maskierePersonendaten(k.inhalt.slice(0, 3000)) });
  const schluessel = [...alleSkripte.matchAll(/["']?(api[A-Za-z]*|[A-Za-z]*(?:Url|URL|Endpoint|endpoint|Base|base)[A-Za-z]*)["']?\s*[:=,]\s*["']([^"']{3,160})["']/g)].slice(0, 25).map((m) => `${m[1]}=${m[2]}`);
  if (schluessel.length) zeilen.push(`Konfig-Schlüssel mit URL/API/Base: ${schluessel.join(" | ")}`);

  const um = (titel: string, muster: RegExp, vor = 300, nach = 900) => {
    const m = muster.exec(html);
    if (m) auszuege.push({ titel, html: maskierePersonendaten(html.slice(Math.max(0, m.index - vor), m.index + nach)) });
  };
  um("Um das erste „/team/“", /\/team\//);
  um("Um das erste „/match/“", /\/match\//);
  um("Um die erste UUID", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  um("Um „THW Kiel“", /THW Kiel/);
  um("Um „Flensburg“", /Flensburg/);
  return { zeilen, auszuege };
}

function auszug(html: string, index: number, vor = 200, nach = 700): string {
  return maskierePersonendaten(html.slice(Math.max(0, index - vor), index + nach));
}

export async function diagnostiziereHbl(wettbewerb: HblWettbewerb): Promise<SeitenDiagnose[]> {
  const a = { wettbewerb, saison: "" };
  const liga = wettbewerb === "hbl2" ? "hbl2" : "hbl1";
  const seiten: { name: string; pfad: string; pruefe: (html: string) => { ergebnis: string[]; auszuege: SeitenDiagnose["auszuege"] } }[] = [
    {
      name: "Teams",
      pfad: HBL_ENDPUNKTE.teams(a),
      pruefe: (html) => {
        const teams = hblParser.teams(html, { league: liga });
        const m = /\/team\/[^"'\s>]+\/[0-9a-f]{8}-/i.exec(html);
        return {
          ergebnis: [`${teams.length} Teams`, ...teams.slice(0, 3).map((t) => `${t.name} · ${t.externalId} · Kürzel ${t.code ?? "—"} · Logo ${t.logoUrl ?? "—"}`)],
          auszuege: m ? [{ titel: "Um den ersten Team-Link", html: auszug(html, m.index) }] : [],
        };
      },
    },
    {
      name: "Spielplan",
      pfad: HBL_ENDPUNKTE.spielplan(a),
      pruefe: (html) => {
        // Namen zum Zuordnen: die Teams der Teamübersicht gibt es im Spielplan nicht, daher nur Zeilen/Links prüfen.
        const wurzel = parseHtml(html);
        const spielLinks = alleMit(wurzel, "a").filter((x) => matchIdAusUrl(attr(x, "href") ?? ""));
        const ergebnis = [`${spielLinks.length} Spiel-Links`, ...spielLinks.slice(0, 3).map((l) => `${matchIdAusUrl(attr(l, "href") ?? "")} · Text: "${textInhalt(l).slice(0, 120)}"`)];
        const m = /\/match\/[0-9a-f]{8}-/i.exec(html);
        return { ergebnis, auszuege: m ? [{ titel: "Um den ersten Spiel-Link", html: auszug(html, m.index) }] : [] };
      },
    },
    {
      name: "Tabelle",
      pfad: HBL_ENDPUNKTE.tabelle(a),
      pruefe: (html) => {
        const { zeilen, warnungen } = hblParser.tabelle(html, { teams: [] });
        const links = alleMit(parseHtml(html), "a").filter((x) => teamAusUrl(attr(x, "href") ?? "")).length;
        const m = /\/team\/[^"'\s>]+\/[0-9a-f]{8}-/i.exec(html);
        return {
          ergebnis: [`${zeilen.length} Zeilen erkannt, ${links} Team-Links`, ...zeilen.slice(0, 3).map((z) => `${z.rang}. ${z.name} · ${z.teamId} · ${z.spiele} Sp. · ${z.punktePlus}:${z.punkteMinus} · ${z.torePlus}:${z.toreMinus}`), ...warnungen.slice(0, 3)],
          auszuege: m ? [{ titel: "Um den ersten Team-Link der Tabelle", html: auszug(html, m.index) }] : [],
        };
      },
    },
  ];
  const ergebnisse: SeitenDiagnose[] = [];
  for (const s of seiten) {
    const start = Date.now();
    const d: SeitenDiagnose = { name: s.name, pfad: s.pfad, url: `${HBL_BASIS}${s.pfad}`, ms: 0, zeichen: null, fehler: null, ergebnis: [], auszuege: [], roh: { zeilen: [], auszuege: [] } };
    try {
      const html = await holeHblSeite(s.pfad);
      d.zeichen = html.length;
      d.roh = rohAnalyse(html);
      try {
        const r = s.pruefe(html);
        d.ergebnis = r.ergebnis;
        d.auszuege = r.auszuege;
      } catch (err) {
        d.fehler = `Parser: ${err instanceof Error ? err.message : String(err)}`;
        // Bei einer unerkannten Struktur den Anfang des sichtbaren Textes mitgeben.
        d.auszuege.push({ titel: "Sichtbarer Text (Anfang)", html: maskierePersonendaten(textInhalt(parseHtml(html)).slice(0, 1200)) });
        d.auszuege.push({ titel: "HTML (Anfang des Bodys)", html: maskierePersonendaten(html.slice(Math.max(0, html.search(/<body/i)), Math.max(0, html.search(/<body/i)) + 1500)) });
      }
    } catch (err) {
      d.fehler = `Abruf: ${err instanceof Error ? err.message : String(err)}`;
    }
    d.ms = Date.now() - start;
    ergebnisse.push(d);
  }
  return ergebnisse;
}


// ---------------------------------------------------------------------------------------------- Skript-Dateien
// Die HBL-Seiten (Nuxt) liefern Teams/Tabelle/Spielplan nicht im HTML, sondern laden sie im Browser nach. Wohin die Anfragen gehen,
// steht im öffentlichen JavaScript der Seite (/_nuxt/….js). Diese Auswertung liest NUR diese öffentlichen Dateien und sucht dort
// Adressen und API-Pfade; sie ruft keine gefundene Schnittstelle selbst auf.

export function skriptPfade(html: string): string[] {
  const pfade = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["'](\/_nuxt\/[A-Za-z0-9_.\-\/]+\.js)["']/g)) pfade.add(m[1]);
  // Einstieg ("entry") zuerst, dann die übrigen in Dokumentreihenfolge (Route-Teile stehen als modulepreload davor/dahinter)
  return [...pfade].sort((a, b) => Number(/entry/i.test(b)) - Number(/entry/i.test(a)));
}

const UNWICHTIG = /(googletagmanager|google-analytics|w3\.org|vuejs\.org|github\.com|mozilla\.org|schema\.org|nuxt\.com|example\.|reactjs|npmjs|opencollective|fonts\.g|gstatic|cloudflare|jsdelivr)/i;
const DATEI = /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|css|map)(\?|$)/i;
const SCHLAGWORT = /(standing|tabelle|table|schedule|spielplan|fixture|ranking|competition|season|team|match|game|live|club|result)/i;

export function analysiereSkript(text: string): { urls: string[]; pfade: string[]; konfig: string[]; auszuege: { titel: string; html: string }[] } {
  const urls = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s"'`\\<>)\],]+/g)) {
    const u = m[0].replace(/[.,;]+$/, "");
    if (!UNWICHTIG.test(u) && !DATEI.test(u)) urls.add(u);
  }
  const pfade = new Set<string>();
  for (const m of text.matchAll(/["'`](\/[A-Za-z0-9_\-./{}$:?=&%]{3,140})["'`]/g)) {
    const p = m[1];
    if (DATEI.test(p) || p.startsWith("/_nuxt") || p.startsWith("//")) continue;
    if (/^\/(api|_api|v\d|graphql|backend|data|content)/i.test(p) || (SCHLAGWORT.test(p) && /[/{$]/.test(p.slice(1)))) pfade.add(p);
  }
  const konfig = [...text.matchAll(/["']?(api[A-Za-z]*|[A-Za-z]*(?:Url|URL|Endpoint|endpoint|BaseURL|Base)[A-Za-z]*)["']?\s*[:=]\s*["'`](https?:\/\/[^"'`]{3,160}|\/[^"'`]{2,160})["'`]/g)]
    .map((m) => `${m[1]}=${m[2]}`)
    .filter((k) => !UNWICHTIG.test(k));
  const auszuege: { titel: string; html: string }[] = [];
  const um = (titel: string, muster: RegExp, vor = 250, nach = 500) => {
    const m = muster.exec(text);
    if (m) auszuege.push({ titel, html: maskierePersonendaten(text.slice(Math.max(0, m.index - vor), m.index + nach)) });
  };
  um("Um „standings“", /standings/i);
  um("Um „$fetch(“", /\$fetch\(/);
  um("Um „useFetch(“", /useFetch\(/);
  um("Um „baseURL“", /baseURL/);
  return { urls: [...urls].slice(0, 60), pfade: [...pfade].slice(0, 80), konfig: [...new Set(konfig)].slice(0, 30), auszuege };
}

export type SkriptDiagnose = {
  seite: string;
  fehler: string | null;
  dateien: { pfad: string; zeichen: number | null; fehler: string | null; urls: string[]; pfade: string[]; konfig: string[]; auszuege: { titel: string; html: string }[] }[];
};

export async function diagnostiziereSkripte(wettbewerb: HblWettbewerb, max = 10): Promise<SkriptDiagnose> {
  const seite = HBL_ENDPUNKTE.tabelle({ wettbewerb, saison: "" });
  const ergebnis: SkriptDiagnose = { seite, fehler: null, dateien: [] };
  let html: string;
  try {
    html = await holeHblSeite(seite);
  } catch (err) {
    ergebnis.fehler = `Abruf: ${err instanceof Error ? err.message : String(err)}`;
    return ergebnis;
  }
  const pfade = skriptPfade(html).slice(0, max);
  if (pfade.length === 0) ergebnis.fehler = "Keine /_nuxt/…js-Dateien im HTML gefunden";
  for (const pfad of pfade) {
    try {
      const text = await holeHblSkriptDatei(pfad);
      ergebnis.dateien.push({ pfad, zeichen: text.length, fehler: null, ...analysiereSkript(text) });
    } catch (err) {
      ergebnis.dateien.push({ pfad, zeichen: null, fehler: err instanceof Error ? err.message : String(err), urls: [], pfade: [], konfig: [], auszuege: [] });
    }
  }
  return ergebnis;
}
