import { isIP } from "node:net";

// Neuigkeiten aus dem Feed (RSS/Atom) der Vereinshomepage — reine Regeln ohne Datenbank und ohne Netzwerk.
// Wir übernehmen NUR Titel, einen kurzen Auszug als reinen Text, den Link zum Original und das Datum: kein HTML, keine Bilder,
// kein Volltext (die Berichte gehören dem Verein und bleiben auf seiner Homepage; die App verlinkt dorthin).

export const FEED_MAX_BYTES = 1_500_000;
export const FEED_MAX_EINTRAEGE = 30;
export const TITEL_MAX = 200;
export const AUSZUG_MAX = 300;

export class FeedFehler extends Error {}

// ---------- Adresse prüfen (Schutz vor Abrufen interner Ziele, SSRF) ----------

/** Ist die IP-Adresse eine öffentliche? Loopback, private, Link-Local (u.a. Cloud-Metadaten 169.254.x), CGNAT, Multicast usw. nein. */
export function istOeffentlicheIp(ip: string): boolean {
  const art = isIP(ip);
  if (art === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && ip.startsWith("192.0.0.")))) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (art === 6) {
    const k = ip.toLowerCase();
    const abgebildet = k.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4 in IPv6
    if (abgebildet) return istOeffentlicheIp(abgebildet[1]);
    if (k === "::" || k === "::1") return false;
    if (/^f[cd]/.test(k) || /^fe[89ab]/.test(k) || k.startsWith("ff")) return false; // ULA, Link-Local, Multicast
    return true;
  }
  return false;
}

/** Prüft die vom Verein eingetragene Feed-Adresse: https, öffentlicher Hostname (kein IP-Literal, kein localhost), keine Zugangsdaten. */
export function pruefeFeedUrl(roh: string): string {
  let t = roh.trim();
  if (/^feed:\/\//i.test(t)) t = `https://${t.slice(7)}`;
  if (!t) throw new FeedFehler("Bitte die Adresse des Feeds eintragen.");
  if (t.length > 500 || /\s/.test(t)) throw new FeedFehler("Die Adresse ist ungültig.");
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    throw new FeedFehler("Die Adresse ist ungültig (z.B. https://www.beispiel.de/feed).");
  }
  if (url.protocol !== "https:") throw new FeedFehler("Die Adresse muss mit https:// beginnen.");
  if (url.username || url.password) throw new FeedFehler("Die Adresse darf keine Zugangsdaten enthalten.");
  if (url.port && url.port !== "443") throw new FeedFehler("Es ist nur der Standardport erlaubt.");
  const host = url.hostname.toLowerCase();
  if (isIP(host.replace(/^\[|\]$/g, "")) !== 0) throw new FeedFehler("Bitte den Namen der Webseite statt einer IP-Adresse eintragen.");
  if (!host.includes(".") || host === "localhost" || /\.(local|localhost|internal|intranet|lan|home|corp)$/.test(host)) {
    throw new FeedFehler("Diese Adresse ist nicht öffentlich erreichbar.");
  }
  url.hash = "";
  return url.toString();
}

// ---------- Feed lesen ----------

export type FeedEintrag = { guid: string; titel: string; auszug: string | null; link: string; datum: Date | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’" };

export function dekodiereEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ohneCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inhalt: string) => inhalt);

/** Reiner Text: HTML (auch maskiert) entfernen, Skripte/Styles verwerfen, Leerraum glätten. */
export function zuReinemText(roh: string): string {
  const cdataInhalt = roh.includes("<![CDATA[");
  let t = ohneCdata(roh);
  if (!cdataInhalt || /&lt;/.test(t)) t = dekodiereEntities(t); // maskiertes HTML (&lt;p&gt;) zuerst lesbar machen
  t = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/?(p|br|div|li|h[1-6]|tr)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, "");
  t = dekodiereEntities(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return t.replace(/\s+/g, " ").trim();
}

export function kurztext(text: string, max: number): string {
  if (text.length <= max) return text;
  const abschnitt = text.slice(0, max);
  const lueckeBei = abschnitt.lastIndexOf(" ");
  return `${(lueckeBei > max * 0.6 ? abschnitt.slice(0, lueckeBei) : abschnitt).trimEnd()}…`;
}

function bloecke(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1]);
}
function erstes(block: string, ...tags: string[]): string | null {
  for (const tag of tags) {
    const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
    if (m) return m[1];
  }
  return null;
}

function linkVon(block: string): string | null {
  // Atom: <link href="…" rel="alternate"/>; RSS: <link>…</link>
  const tags = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)];
  const atom = tags.map((m) => m[1]).filter((a) => /href\s*=/i.test(a));
  const bevorzugt = atom.find((a) => !/rel\s*=/i.test(a) || /rel\s*=\s*["']alternate["']/i.test(a)) ?? atom[0];
  if (bevorzugt) return dekodiereEntities(bevorzugt.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? "").trim() || null;
  const rss = erstes(block, "link");
  return rss ? zuReinemText(rss) || null : null;
}

function sichererLink(roh: string | null): string | null {
  if (!roh) return null;
  try {
    const u = new URL(roh);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null; // kein javascript:/data:
    if (u.username || u.password) return null;
    return u.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function datumVon(block: string): Date | null {
  const roh = erstes(block, "pubDate", "dc:date", "published", "updated", "date");
  if (!roh) return null;
  const d = new Date(zuReinemText(roh));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Liest RSS 2.0, RSS 1.0 (RDF) und Atom. Einträge ohne Titel oder gültigen Link werden verworfen; neueste zuerst, höchstens 30. */
export function parseFeed(xml: string): FeedEintrag[] {
  const kopf = xml.slice(0, 2000).toLowerCase();
  if (!/<(rss|feed|rdf:rdf)\b/.test(kopf) && !/<(rss|feed|rdf:rdf)\b/.test(xml.toLowerCase().slice(0, 20000))) {
    throw new FeedFehler("Das ist kein RSS- oder Atom-Feed.");
  }
  const roh = [...bloecke(xml, "item"), ...bloecke(xml, "entry")];
  const eintraege: FeedEintrag[] = [];
  for (const b of roh) {
    const titel = kurztext(zuReinemText(erstes(b, "title") ?? ""), TITEL_MAX);
    const link = sichererLink(linkVon(b));
    if (!titel || !link) continue;
    const beschr = erstes(b, "description", "summary", "content:encoded", "content");
    const auszugText = beschr ? zuReinemText(beschr) : "";
    const guidRoh = erstes(b, "guid", "id");
    const guid = (guidRoh ? zuReinemText(guidRoh) : "") || link;
    eintraege.push({ guid: guid.slice(0, 500), titel, auszug: auszugText ? kurztext(auszugText, AUSZUG_MAX) : null, link, datum: datumVon(b) });
  }
  // Doppelte Kennungen nur einmal; neueste zuerst (ohne Datum zuletzt, Reihenfolge des Feeds bleibt).
  const gesehen = new Set<string>();
  return eintraege
    .filter((e) => (gesehen.has(e.guid) ? false : (gesehen.add(e.guid), true)))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.datum?.getTime() ?? -Infinity) - (a.e.datum?.getTime() ?? -Infinity) || a.i - b.i)
    .map((x) => x.e)
    .slice(0, FEED_MAX_EINTRAEGE);
}

/** Host einer Link-Adresse ohne „www.“, für „Weiterlesen auf …“. */
export function anzeigeHost(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "der Homepage";
  }
}
