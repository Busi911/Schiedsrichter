import { berlinOffset } from "@/lib/format";
import type { MatchStatus } from "../match";
import { alleMit, attr, nachfahren, parseHtml, textInhalt, type Knoten } from "./html";
import type { HblEndpunkte, HblLiveStand, HblParser, HblSpiel, HblTabellenzeile, HblTeam, HblTeamRef } from "./types";

// Reine Auswertung der ÖFFENTLICHEN HBL-Seiten (HTML, keine private Sportradar-API). Technik: semantische Anker statt
// Layout-Annahmen — Links (…/team/<Code>/<UUID>, …/match/<UUID>), die sichtbare Zeile eines Spiels bzw. einer Tabellenzeile
// und Überschriften mit Datum. Was nicht eindeutig lesbar ist, wird nie geraten (Warnung); eine Seite ohne erkennbare
// Struktur wirft `HblLayoutFehler`. WICHTIG: noch nicht gegen die echte Seite verifiziert (nur gegen nachgebaute Fixtures).

export const HBL_BASIS = "https://www.opel-hbl.de";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export class HblLayoutFehler extends Error {
  constructor(was: string) {
    super(`HBL-Seite: ${was} — Layout geändert oder Struktur unerwartet`);
  }
}

// "/de/team/THW/febf038e-…" (auch mit Domain) -> { code: "THW", externalId: "febf038e-…" }; Kürzel "undefined" gilt als fehlend.
export function teamAusUrl(url: string): { code: string | null; externalId: string } | null {
  const m = url.match(new RegExp(`/team/([^/?#\\s]*)/(${UUID})(?=[/?#]|$)`, "i"));
  if (!m) return null;
  const code = m[1] && m[1].toLowerCase() !== "undefined" ? m[1] : null;
  return { code, externalId: m[2].toLowerCase() };
}

// "/de/match/b1dc79f0-…" (auch mit Domain) -> UUID
export function matchIdAusUrl(url: string): string | null {
  const m = url.match(new RegExp(`/match/(${UUID})(?=[/?#]|$)`, "i"));
  return m ? m[1].toLowerCase() : null;
}

export const baueMatchUrl = (externalMatchId: string) => `${HBL_BASIS}/de/match/${externalMatchId}`;
const baueTeamUrl = (code: string | null, id: string) => `${HBL_BASIS}/de/team/${code ?? "undefined"}/${id}`;

export function absolutUrl(href: string): string {
  try {
    return new URL(href, HBL_BASIS).toString();
  } catch {
    return href;
  }
}

// Endpunkte (vorgegeben und extern geprüft): je Liga Teams, Spielplan, Tabelle; Spielseite je UUID.
const LIGA_PFAD = { hbl1: "hbl", hbl2: "2-hbl" } as const;
export const HBL_ENDPUNKTE: HblEndpunkte = {
  teams: (a) => `/de/${pfad(a.wettbewerb)}/teams`,
  spielplan: (a) => `/de/${pfad(a.wettbewerb)}/spielplan`,
  tabelle: (a) => `/de/${pfad(a.wettbewerb)}/tabelle`,
  spiel: (id) => `/de/match/${id}`,
};
function pfad(w: string): string {
  if (w === "hbl1" || w === "hbl2") return LIGA_PFAD[w];
  throw new Error(`HBL: für ${w} sind noch keine öffentlichen Adressen bekannt`);
}

// Status aus dem sichtbaren Text ("Beendet", "Live"); Sportradar-Namen werden ebenfalls erkannt (für eine spätere
// strukturierte Quelle). Unbekanntes -> null (der Aufrufer behandelt es als geplant).
const STATUS_TEXT: Record<string, MatchStatus> = {
  beendet: "finished",
  live: "live",
  verlegt: "postponed",
  abgesagt: "cancelled",
  not_started: "scheduled",
  first_half: "live",
  second_half: "live",
  first_half_ot: "live",
  second_half_ot: "live",
  penalty_shooting: "live",
  awaiting_ot: "live",
  awaiting_penalties: "live",
  halftime: "halftime",
  ot_halftime: "halftime",
  ended: "finished",
  after_ot: "finished",
  after_penalties: "finished",
  interrupted: "interrupted",
  abandoned: "cancelled",
};
export function mappeHblStatus(roh: string | null | undefined): MatchStatus | null {
  return roh ? (STATUS_TEXT[roh.trim().toLowerCase()] ?? null) : null;
}

export const ERLAUBTE_LOGO_HOSTS = ["images.dc.connect.sportradar.com"];
export function istErlaubteLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ERLAUBTE_LOGO_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

// Logo aus einem <img>: src, data-src oder das erste srcset-Element; bei der Next.js-Bildauslieferung (/_next/image?url=…)
// steht die echte Adresse im Parameter "url". Nie aus Name oder UUID konstruiert.
function logoAusImg(img: Knoten): string | null {
  const kandidaten = [attr(img, "src"), attr(img, "data-src"), attr(img, "srcset")?.split(",")[0]?.trim().split(/\s+/)[0] ?? null];
  for (const roh of kandidaten) {
    if (!roh) continue;
    let url = absolutUrl(roh);
    try {
      const u = new URL(url);
      if (u.pathname.startsWith("/_next/image") && u.searchParams.get("url")) url = absolutUrl(u.searchParams.get("url")!);
    } catch {
      continue;
    }
    if (istErlaubteLogoUrl(url)) return url;
  }
  return null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");

// ---------------------------------------------------------------------------------------------- Teams
export function parseTeamsHtml(html: string, league: "hbl1" | "hbl2"): HblTeam[] {
  const wurzel = parseHtml(html);
  const teams = new Map<string, HblTeam>();
  for (const a of alleMit(wurzel, "a")) {
    const href = attr(a, "href");
    const t = href ? teamAusUrl(href) : null;
    if (!t) continue;
    const bilder = [...nachfahren(a)].filter((n) => n.tag === "img");
    const text = textInhalt(a);
    const name = (text || bilder.map((b) => attr(b, "alt")).find(Boolean) || attr(a, "title") || attr(a, "aria-label") || "").trim();
    const logo = bilder.map(logoAusImg).find(Boolean) ?? null;
    const alt = teams.get(t.externalId);
    teams.set(t.externalId, {
      externalId: t.externalId,
      code: alt?.code ?? t.code,
      name: alt?.name && alt.name.length >= name.length ? alt.name : name,
      shortName: alt?.shortName ?? t.code,
      logoUrl: alt?.logoUrl ?? logo,
      league,
      sourceUrl: baueTeamUrl(t.code, t.externalId),
    });
  }
  const liste = [...teams.values()].filter((t) => t.name);
  if (liste.length === 0) throw new HblLayoutFehler("keine Team-Links (…/team/<Code>/<UUID>) gefunden");
  return liste;
}

// ---------------------------------------------------------------------------------------------- Zeilen
const MONATE: Record<string, number> = { jan: 1, feb: 2, mär: 3, mrz: 3, märz: 3, maerz: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dez: 12 };
const DATUM = /^(?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?,?\s+)?(\d{1,2})\.?\s+([A-Za-zäÄ]{3,5})\.?\s+(\d{2}|\d{4})$/;

export function parseDatumText(text: string): string | null {
  const m = text.trim().match(DATUM);
  if (!m) return null;
  const monat = MONATE[m[2].toLowerCase()];
  if (!monat) return null;
  const jahr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${jahr}-${String(monat).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// "SC Magdeburg 35 Beendet HC Erlangen 28", "TVB Stuttgart 26 Live TBV Lemgo Lippe 28", "Rhein-Neckar Löwen Do., 19:00 ThSV Eisenach"
const ZEILE_ERGEBNIS = /^(.+?)\s+(\d{1,3})\s+(Beendet|Live)\s+(.+?)\s+(\d{1,3})$/;
const ZEILE_ANSTOSS = /^(.+?)\s+(?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?,?\s+)?(\d{1,2}):(\d{2})\s+(.+)$/;

type Zeile = {
  heim: string;
  gast: string;
  status: MatchStatus | null;
  heimTore: number | null;
  gastTore: number | null;
  uhrzeit: string | null;
};

export function parseSpielZeile(text: string): Zeile | null {
  const t = text.replace(/\s+/g, " ").trim();
  const e = t.match(ZEILE_ERGEBNIS);
  if (e) return { heim: e[1], gast: e[4], status: mappeHblStatus(e[3]), heimTore: Number(e[2]), gastTore: Number(e[5]), uhrzeit: null };
  const a = t.match(ZEILE_ANSTOSS);
  if (a) return { heim: a[1], gast: a[4], status: null, heimTore: null, gastTore: null, uhrzeit: `${a[2].padStart(2, "0")}:${a[3]}` };
  return null;
}

function anzahlLinks(k: Knoten, wasFuer: (href: string) => boolean): number {
  return alleMit(k, "a").filter((a) => {
    const h = attr(a, "href");
    return !!h && wasFuer(h);
  }).length;
}

function teamLinksIn(k: Knoten) {
  return alleMit(k, "a")
    .map((a) => teamAusUrl(attr(a, "href") ?? ""))
    .filter((t): t is NonNullable<typeof t> => !!t);
}

// ---------------------------------------------------------------------------------------------- Spielplan
export function parseSpielplanHtml(html: string, teams: HblTeamRef[]): { spiele: HblSpiel[]; warnungen: string[] } {
  const wurzel = parseHtml(html);
  const index = new Map(teams.map((t) => [norm(t.name), t.externalId]));
  const warnungen: string[] = [];

  // Dokumentreihenfolge: Datumsüberschriften und Spiel-Links.
  let datum: string | null = null;
  const spiele = new Map<string, HblSpiel>();
  let links = 0;
  let nichtLesbar = 0;
  for (const n of nachfahren(wurzel)) {
    if (n.tag !== "a") {
      const d = parseDatumText(textInhalt(n));
      if (d && anzahlLinks(n, (h) => !!matchIdAusUrl(h)) === 0) datum = d;
      continue;
    }
    const href = attr(n, "href");
    const id = href ? matchIdAusUrl(href) : null;
    if (!id) continue;
    links++;

    // Zeile: der Link selbst, sonst die nächsten Vorfahren, solange sie nur dieses eine Spiel enthalten.
    let zeile: Zeile | null = null;
    let kontext: Knoten | null = n;
    for (let i = 0; kontext && i < 5 && !zeile; i++) {
      if (anzahlLinks(kontext, (h) => !!matchIdAusUrl(h)) > 1) break;
      zeile = parseSpielZeile(textInhalt(kontext));
      if (!zeile) kontext = kontext.eltern;
    }
    if (!zeile || !kontext || !datum) {
      nichtLesbar++;
      warnungen.push(`Spiel ${id}: Zeile oder Datum nicht lesbar`);
      continue;
    }
    // Team-UUIDs: aus Team-Links der Zeile (Reihenfolge Heim, Gast), sonst über den Namen.
    let teamLinks = teamLinksIn(kontext);
    for (let k: Knoten | null = kontext.eltern, i = 0; k && i < 3 && teamLinks.length < 2; k = k.eltern, i++) {
      if (anzahlLinks(k, (h) => !!matchIdAusUrl(h)) !== 1) break;
      teamLinks = teamLinksIn(k);
    }
    const heimId = teamLinks[0]?.externalId ?? index.get(norm(zeile.heim));
    const gastId = teamLinks[1]?.externalId ?? index.get(norm(zeile.gast));
    if (!heimId || !gastId) {
      nichtLesbar++;
      warnungen.push(`Spiel ${id}: Team nicht zuordenbar ("${zeile.heim}" / "${zeile.gast}")`);
      continue;
    }
    const startTime = zeile.uhrzeit ? new Date(`${datum}T${zeile.uhrzeit}:00${berlinOffset(datum)}`) : null;
    spiele.set(id, {
      externalMatchId: id,
      datum,
      uhrzeit: zeile.uhrzeit,
      startTime,
      status: zeile.status,
      matchday: null,
      home: { externalId: heimId, name: zeile.heim, shortName: null },
      away: { externalId: gastId, name: zeile.gast, shortName: null },
      homeScore: zeile.heimTore,
      awayScore: zeile.gastTore,
      halftimeHomeScore: null,
      halftimeAwayScore: null,
      venue: null,
    });
  }
  if (links === 0) throw new HblLayoutFehler("keine Spiel-Links (…/match/<UUID>) gefunden");
  if (spiele.size === 0 || nichtLesbar > links / 2) throw new HblLayoutFehler(`${nichtLesbar} von ${links} Spielen nicht lesbar`);
  return { spiele: [...spiele.values()], warnungen };
}

// ---------------------------------------------------------------------------------------------- Tabelle
// "1 SG Flensburg-Handewitt 5 10:0 5 0 0 181 157 24" = PL., Name, SP, PKT, S, U, N, T, GT, T+/-
const ZEILE_TABELLE = /^(\d{1,2})\s+(.+?)\s+(\d{1,2})\s+(\d{1,3}):(\d{1,3})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,4})\s+(\d{1,4})\s+([+\-−–]?\s?\d{1,4})$/;

export function parseTabelleHtml(html: string, teams: HblTeamRef[]): { zeilen: HblTabellenzeile[]; warnungen: string[] } {
  const wurzel = parseHtml(html);
  const index = new Map(teams.map((t) => [norm(t.name), t.externalId]));
  const warnungen: string[] = [];
  const zeilen = new Map<number, HblTabellenzeile>();
  let erkannt = 0;

  // Innerste Elemente, deren ganzer Text eine Tabellenzeile ist (Tabelle, Liste oder Grid — das Layout ist egal).
  const trifft = (k: Knoten) => ZEILE_TABELLE.test(textInhalt(k));
  for (const n of nachfahren(wurzel)) {
    if (!trifft(n)) continue;
    if ([...nachfahren(n)].some(trifft)) continue; // nur das innerste
    const m = textInhalt(n).match(ZEILE_TABELLE)!;
    erkannt++;
    const name = m[2].trim();
    const link = alleMit(n, "a").map((a) => teamAusUrl(attr(a, "href") ?? "")).find(Boolean);
    const teamId = link?.externalId ?? index.get(norm(name));
    const rang = Number(m[1]);
    if (!teamId) {
      warnungen.push(`Tabellenplatz ${rang}: Team "${name}" nicht zuordenbar`);
      continue;
    }
    zeilen.set(rang, {
      teamId,
      name,
      rang,
      spiele: Number(m[3]),
      siege: Number(m[6]),
      unentschieden: Number(m[7]),
      niederlagen: Number(m[8]),
      torePlus: Number(m[9]),
      toreMinus: Number(m[10]),
      punktePlus: Number(m[4]),
      punkteMinus: Number(m[5]),
    });
  }
  if (erkannt === 0) throw new HblLayoutFehler("keine Tabellenzeilen (PL., Name, SP, PKT, S, U, N, T, GT, T+/-) erkannt");
  return { zeilen: [...zeilen.values()].sort((a, b) => a.rang - b.rang), warnungen };
}

// ---------------------------------------------------------------------------------------------- Spielseite (Live)
// Die öffentliche Spielseite zeigt z.B. "TVB Stuttgart 26 Live TBV Lemgo Lippe 28". Gelesen werden nur Stand und Status.
export function parseSpielseiteHtml(html: string, externalMatchId: string): HblLiveStand | null {
  const wurzel = parseHtml(html);
  const trifft = (k: Knoten) => ZEILE_ERGEBNIS.test(textInhalt(k));
  for (const n of nachfahren(wurzel)) {
    if (!trifft(n) || [...nachfahren(n)].some(trifft)) continue;
    const z = parseSpielZeile(textInhalt(n));
    if (z && z.heimTore !== null) return { externalMatchId, status: z.status, homeScore: z.heimTore, awayScore: z.gastTore };
  }
  return null; // künftiges Spiel ohne Stand oder unbekanntes Layout
}

export const hblParser: HblParser = {
  teams: (html, k) => parseTeamsHtml(html, k.league),
  spielplan: (html, k) => parseSpielplanHtml(html, k.teams),
  tabelle: (html, k) => parseTabelleHtml(html, k.teams),
  spiel: (html, id) => parseSpielseiteHtml(html, id),
};
