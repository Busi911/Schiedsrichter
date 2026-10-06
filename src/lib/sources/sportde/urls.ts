import { SPORTDE_LIGEN, type SportDeLiga } from "../match";

export const SPORTDE_BASIS = "https://www.sport.de";

// /handball/deutschland-hbl/md7/ergebnisse-und-tabelle/
export function spieltagPfad(liga: SportDeLiga, spieltag: number): string {
  return `/handball/${SPORTDE_LIGEN[liga].pfad}/md${spieltag}/ergebnisse-und-tabelle/`;
}

const ANSICHTEN = new Set(["uebersicht", "liveticker", "statistik", "aufstellung", "aufstellungen", "tabelle", "spielbericht", "ticker", "news", "videos", "tipps", "quoten"]);

export type MatchLink = { externalMatchId: string; ligaPfad: string; pfad: string };

// Aus einem href die Match-ID ("ma\d+") und das Spielverzeichnis lesen:
//   /handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/liveticker/ -> ma11406368, /handball/deutschland-2-hbl/ma11406368/tusem-essen_tv-grosswallstadt/
export function matchLinkAusHref(href: string): MatchLink | null {
  let pfad = href.trim();
  const mitDomain = pfad.match(/^https?:\/\/[^/]+(\/.*)$/i);
  if (mitDomain) pfad = mitDomain[1];
  pfad = pfad.split(/[?#]/)[0];
  const teile = pfad.split("/").filter(Boolean);
  const i = teile.findIndex((t) => /^ma\d+$/.test(t));
  if (i < 1 || teile[0] !== "handball") return null;
  const slug = teile[i + 1] && !ANSICHTEN.has(teile[i + 1]) ? teile[i + 1] : null;
  const basis = `/${teile.slice(0, i + 1).join("/")}/${slug ? `${slug}/` : ""}`;
  return { externalMatchId: teile[i], ligaPfad: `/${teile.slice(0, i).join("/")}/`, pfad: basis };
}

// Match-ID aus beliebigem Text/URL ("/ma\d+/")
export function matchIdAusUrl(url: string): string | null {
  const m = url.match(/\/(ma\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

export const uebersichtPfad = (basis: string) => `${basis}uebersicht/`;
export const livetickerPfad = (basis: string) => `${basis}liveticker/`;
export const vollUrl = (pfad: string) => `${SPORTDE_BASIS}${pfad}`;

// Team-Slug aus einem Team-Link: der Pfadteil nach "team", "teams", "mannschaft", "mannschaften" oder "verein".
export function teamSlugAusHref(href: string): string | null {
  const pfad = href.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
  const teile = pfad.split("/").filter(Boolean);
  const i = teile.findIndex((t) => /^(team|teams|mannschaft|mannschaften|verein|vereine)$/i.test(t));
  const slug = i >= 0 ? teile[i + 1] : undefined;
  return slug && !/^ma\d+$/.test(slug) ? slug : null;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ohne Team-Link gibt es keinen sport.de-Slug: stabiler Ersatzschlüssel aus dem Namen (mit Präfix, damit er als solcher erkennbar bleibt).
export const teamIdAusNamen = (name: string) => `name:${slugify(name)}`;
