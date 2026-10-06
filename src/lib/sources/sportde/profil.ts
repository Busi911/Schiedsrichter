import type { Knoten } from "./html";
import type { Spielzeile } from "./zeile";
import { matchLinkAusHref, SPORTDE_BASIS, teamSlugAusHref, type MatchLink, vollUrl } from "./urls";

// Was die Parser je Quelle unterscheidet (Link-Formen, Basis-Adresse, erlaubte Logo-Hosts, Zeilendeutung). Die Parser für Spieltagsseite und
// Tabelle sind für sport.de und Sportschau dieselben (Erkennung über Links und sichtbaren Text); nur dieses Profil ist quellenspezifisch.
export type ParserProfil = {
  name: string; // für Fehlermeldungen: "sport.de"
  basis: string;
  vollUrl: (pfad: string) => string;
  matchLink: (href: string) => MatchLink | null;
  teamKennung: (href: string) => { id: string; slug: string | null } | null;
  logoErlaubt: (url: string) => boolean;
  // Liest die sichtbare Zeile eines Spiels; ohne Angabe die Standarddeutung (zerlege + deuteSpielzeile).
  deute?: (k: Knoten) => Spielzeile | null;
  // Tabellenname aus dem Team-Link-Text (statt aus dem Zeilentext) — nützlich, wenn die Zeile zusätzlich ein Kürzel zeigt.
  nameAusLink?: boolean;
};

// Logos nur von sport.de selbst (https). Weitere Hosts erst eintragen, wenn die Diagnose sie zeigt.
export const ERLAUBTE_LOGO_HOSTS: string[] = [];
export function istErlaubteLogoUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "sport.de" || u.hostname.endsWith(".sport.de") || ERLAUBTE_LOGO_HOSTS.includes(u.hostname));
  } catch {
    return false;
  }
}

export const SPORTDE_PROFIL: ParserProfil = {
  name: "sport.de",
  basis: SPORTDE_BASIS,
  vollUrl,
  matchLink: matchLinkAusHref,
  teamKennung: (href) => {
    const slug = teamSlugAusHref(href);
    return slug ? { id: slug, slug } : null;
  },
  logoErlaubt: istErlaubteLogoUrl,
};
