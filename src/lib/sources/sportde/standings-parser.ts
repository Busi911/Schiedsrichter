import { alleMit, attr, nachfahren, parseHtml, textInhalt, type Knoten } from "./html";
import { teamIdAusNamen } from "./urls";
import { SPORTDE_PROFIL, type ParserProfil } from "./profil";
import { SportDeLayoutFehler, type SportDeTabellenzeile, type SportDeTeam } from "./types";
import type { SportDeLiga } from "../match";

// Tabelle und Teams aus der Spieltagsseite (die Tabelle steht auf jeder Seite). Zeilenerkennung über den sichtbaren Text, nicht über
// Spalten-Positionen im HTML: "1 SG BBM Bietigheim 7 4 3 0 202:189 13 11:3" = #, Mannschaft, Sp., S, U, N, Tore, Diff., Pkt.
// Pkt. ist beim Handball "11:3": nie als Einzelzahl speichern (punktePlus/punkteMinus + Rohtext).

const ZEILE = /^(\d{1,2})\.?\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,4})\s*:\s*(\d{1,4})\s+([+\-−–]?\s?\d{1,4})\s+(\d{1,3})\s*:\s*(\d{1,3})$/;

export { ERLAUBTE_LOGO_HOSTS, istErlaubteLogoUrl } from "./profil";

export function absolutUrl(href: string, basis: string = SPORTDE_PROFIL.basis): string {
  try {
    return new URL(href, basis).toString();
  } catch {
    return href;
  }
}

// Logo aus einem <img>: src, data-src oder das erste srcset-Element. Nie aus Name oder Slug konstruiert.
export function logoAusKnoten(k: Knoten, profil: ParserProfil = SPORTDE_PROFIL): { url: string | null; gesehen: string | null } {
  let gesehen: string | null = null;
  for (const bild of [...nachfahren(k)].filter((n) => n.tag === "img")) {
    const kandidaten = [attr(bild, "src"), attr(bild, "data-src"), attr(bild, "data-lazy-src"), attr(bild, "srcset")?.split(",")[0]?.trim().split(/\s+/)[0] ?? null];
    for (const roh of kandidaten) {
      if (!roh || roh.startsWith("data:")) continue;
      const url = absolutUrl(roh, profil.basis);
      gesehen ??= url;
      if (profil.logoErlaubt(url)) return { url, gesehen };
    }
  }
  return { url: null, gesehen };
}

export function parseTabelleHtml(html: string, liga: SportDeLiga, profil: ParserProfil = SPORTDE_PROFIL): { zeilen: SportDeTabellenzeile[]; teams: SportDeTeam[]; warnungen: string[] } {
  const wurzel = parseHtml(html);
  const warnungen: string[] = [];
  const zeilen: SportDeTabellenzeile[] = [];
  const teams: SportDeTeam[] = [];
  const gesehenRaenge = new Set<number>();
  const trifft = (k: Knoten) => ZEILE.test(textInhalt(k));
  let erkannt = 0;
  let ersteTabelleFertig = false;
  for (const n of nachfahren(wurzel)) {
    if (ersteTabelleFertig) break;
    if (!trifft(n) || [...nachfahren(n)].some(trifft)) continue; // nur das innerste Element der Zeile
    const m = textInhalt(n).match(ZEILE)!;
    const rang = Number(m[1]);
    // Eine zweite Tabelle (Heim-/Auswärts-/Formtabelle) beginnt wieder bei Platz 1: nur die erste wird gelesen.
    if (gesehenRaenge.has(rang)) {
      ersteTabelleFertig = true;
      continue;
    }
    gesehenRaenge.add(rang);
    erkannt++;
    const link = alleMit(n, "a").map((a) => ({ a, kennung: profil.teamKennung(attr(a, "href") ?? "") })).find((x) => x.kennung);
    const linkText = profil.nameAusLink && link ? textInhalt(link.a).trim() : "";
    const name = linkText || m[2].trim();
    const teamId = link?.kennung?.id ?? teamIdAusNamen(name);
    if (!link) warnungen.push(`Tabellenplatz ${rang}: kein Team-Link, Schlüssel aus dem Namen ("${name}")`);
    const logo = logoAusKnoten(n, profil);
    const punkte = [Number(m[10]), Number(m[11])] as const;
    zeilen.push({
      teamId,
      name,
      logoUrl: logo.url,
      rang,
      spiele: Number(m[3]),
      siege: Number(m[4]),
      unentschieden: Number(m[5]),
      niederlagen: Number(m[6]),
      torePlus: Number(m[7]),
      toreMinus: Number(m[8]),
      tordifferenz: Number(m[9].replace(/[−–]/g, "-").replace(/\s/g, "")),
      punktePlus: punkte[0],
      punkteMinus: punkte[1],
      punkteRoh: `${m[10]}:${m[11]}`,
    });
    teams.push({
      externalId: teamId,
      slug: link?.kennung?.slug ?? null,
      name,
      shortName: null,
      logoUrl: logo.url,
      league: liga,
      sourceUrl: link ? profil.vollUrl(new URL(absolutUrl(attr(link.a, "href") ?? "", profil.basis)).pathname) : null,
    });
  }
  if (erkannt === 0) throw new SportDeLayoutFehler(profil.name, "keine Tabellenzeilen (#, Mannschaft, Sp., S, U, N, Tore, Diff., Pkt.) erkannt");
  return { zeilen: zeilen.sort((a, b) => a.rang - b.rang), teams, warnungen };
}
