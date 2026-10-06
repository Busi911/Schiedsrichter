import type { SportDeLiga } from "../match";
import { slugify } from "../sportde/urls";

export const NDR_BASIS = "https://www.ndr.de";

// Spielplan, Ergebnisse und Tabelle der Männer-Bundesligen auf ndr.de (öffentliche, serverseitig gelieferte HTML-Seiten).
//  1. HBL: je Spieltag eine Seite mit dem Bestandteil "_matchDay-<n>" (so erzeugt NDR seine Vor-/Zurück-Links selbst; `findeSpieltagLinks` liest sie aus dem HTML).
//  2. HBL: eine zentrale Saisonseite mit allen Spieltagen untereinander ("1. Spieltag" … "34. Spieltag").
export function spieltagPfad(liga: SportDeLiga, spieltag: number, saisonStart: number): string {
  if (liga === "hbl1") return `/sport/ergebnisse/handballmaenner-182~_matchDay-${spieltag}.html`;
  return `/sport/ergebnisse/Alle-Ergebnisse-2-Handball-Bundesliga-${saisonStart}-${saisonStart + 1}%2Chandballmaenner-186.html`;
}

export const vollUrl = (pfad: string) => `${NDR_BASIS}${pfad}`;

// Links zu anderen Spieltagen aus dem HTML selbst (Navigation "vorheriger/nächster Spieltag"): href mit "_matchDay-<n>.html".
export function findeSpieltagLinks(hrefs: string[]): { spieltag: number; href: string }[] {
  const gesehen = new Map<number, string>();
  for (const href of hrefs) {
    const m = href.match(/_matchDay-(\d{1,2})\.html/i);
    if (m && !gesehen.has(Number(m[1]))) gesehen.set(Number(m[1]), href);
  }
  return [...gesehen].map(([spieltag, href]) => ({ spieltag, href })).sort((a, b) => a.spieltag - b.spieltag);
}

// NDR liefert keine Spiel-IDs: stabiler Schlüssel aus Wettbewerb, Saison, Spieltag und der Paarung (eine Paarung kommt je Saison und Spieltag einmal vor).
export function matchSchluessel(liga: SportDeLiga, saisonStart: number, spieltag: number, heim: string, gast: string): string {
  return `${liga}-${saisonStart}-${String(saisonStart + 1).slice(2)}-md${spieltag}-${slugify(heim)}_${slugify(gast)}`;
}
export const teamId = (name: string) => `name:${slugify(name)}`;
