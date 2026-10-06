import type { SportDeLiga } from "../match";
import { attr, alleMit, parseHtml, textGetrennt, textInhalt, type Knoten } from "../sportde/html";
import type { ParserProfil } from "../sportde/profil";
import { SportDeLayoutFehler, type SportDeSpiel, type SportDeTabellenzeile, type SportDeTeam } from "../sportde/types";
import { absolutUrl, logoAusKnoten } from "../sportde/standings-parser";
import { loeseDatum, mappeStatus, startZeit, zerlege, type Spielzeile, type Zeilenteil } from "../sportde/zeile";
import { findeSpieltagLinks, matchSchluessel, NDR_BASIS, teamId, vollUrl } from "./urls";

// Parser für NDR-Ergebnisseiten (Männer-Bundesliga). Aufbau der Seite (laut Beschreibung): Abschnitte "N. Spieltag" mit Zeilen Datum/Uhrzeit,
// Paarung, Erg. (Endstand, Halbzeitstand) und Abschnitte "Tabelle N. Spieltag" mit Platz, Verein, Spiele, Siege, Unentschieden, Niederlagen,
// Tordifferenz, Tore, Punkte. Es werden KEINE Positionen (nth-child) oder CSS-Klassen angenommen: Abschnitte über ihre Überschriften, Zeilen über
// den sichtbaren Text (innerstes Element, das sich als Zeile lesen lässt). Was nicht lesbar ist, wird gemeldet statt geraten.

export const NDR_PROFIL: ParserProfil = {
  name: "ndr.de",
  basis: NDR_BASIS,
  vollUrl,
  matchLink: () => null,
  teamKennung: () => null,
  logoErlaubt: (url) => {
    try {
      const u = new URL(url);
      return u.protocol === "https:" && (u.hostname === "ndr.de" || u.hostname.endsWith(".ndr.de"));
    } catch {
      return false;
    }
  },
};

const gueltigeZeit = (h: number, m: number) => h <= 23 && m <= 59;
const zeitText = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

// Eine Spielzeile: genau zwei Namen. Zahlenpaare VOR den Namen sind die Uhrzeit, ein Paar zwischen oder hinter den Namen das Ergebnis, ein weiteres
// (oder "Halbzeit: d:d" / "(d:d)") der Halbzeitstand. Steht hinter den Namen nur EIN Paar ohne Halbzeitstand und ist es eine gültige Uhrzeit,
// ist es die Anstoßzeit (Spiel noch nicht gespielt).
export function deuteNdrZeile(teile: Zeilenteil[]): Spielzeile | null {
  const namen = teile.map((t, i) => ({ t, i })).filter((x): x is { t: Extract<Zeilenteil, { art: "text" }>; i: number } => x.t.art === "text");
  let heim: string;
  let gast: string;
  let i1: number;
  let i2: number;
  if (namen.length === 2) {
    [heim, gast] = [namen[0].t.wert, namen[1].t.wert];
    i1 = namen[0].i;
    i2 = namen[1].i;
  } else if (namen.length === 1) {
    const geteilt = namen[0].t.wert.split(/\s+[-–—:]\s+|\s+vs\.?\s+/i);
    if (geteilt.length !== 2) return null;
    [heim, gast] = geteilt.map((x) => x.trim());
    i1 = i2 = namen[0].i;
  } else return null;
  if (!heim || !gast) return null;

  const paare = teile.map((t, i) => ({ t, i })).filter((x): x is { t: Extract<Zeilenteil, { art: "zahlenpaar" }>; i: number } => x.t.art === "zahlenpaar");
  const hz = teile.find((t): t is Extract<Zeilenteil, { art: "halbzeit" }> => t.art === "halbzeit");
  const statusTeil = teile.find((t): t is Extract<Zeilenteil, { art: "status" }> => t.art === "status");
  const gueltig = (p: { t: { heim: number; gast: number } }) => gueltigeZeit(p.t.heim, p.t.gast);

  const vor = paare.filter((p) => p.i < i1);
  const rest = paare.filter((p) => p.i > i1 && (i1 === i2 || p.i !== i2));
  let zeit = vor.find(gueltig) ?? null;
  let ergebnis: (typeof paare)[number] | null = null;
  let halb: (typeof paare)[number] | null = null;
  if (rest.length > 0) {
    if (!zeit && !hz && rest.length === 1 && gueltig(rest[0]) && rest[0].i > i2) zeit = rest[0];
    else {
      ergebnis = rest[0];
      halb = rest[1] ?? null;
    }
  }
  const datum = teile.find((t): t is Extract<Zeilenteil, { art: "datum" }> => t.art === "datum");
  const spieltag = teile.find((t): t is Extract<Zeilenteil, { art: "spieltag" }> => t.art === "spieltag");
  const status = statusTeil ? mappeStatus(statusTeil.wert) : ergebnis ? "finished" : zeit ? "scheduled" : null;
  return {
    heim,
    gast,
    status,
    statusText: statusTeil?.wert ?? null,
    minute: null,
    datum: datum ? { tag: datum.tag, monat: datum.monat, jahr: datum.jahr } : null,
    uhrzeit: zeit ? zeitText(zeit.t.heim, zeit.t.gast) : null,
    heimTore: ergebnis?.t.heim ?? null,
    gastTore: ergebnis?.t.gast ?? null,
    halbzeitHeim: hz?.heim ?? halb?.t.heim ?? null,
    halbzeitGast: hz?.gast ?? halb?.t.gast ?? null,
    spieltag: spieltag?.wert ?? null,
  };
}

// Tabellenzeile: "1 1. VfL Potsdam 6 6 0 0 +17 182:165 12:0" (Tordifferenz und Tore in beliebiger Reihenfolge). Beschriftungen in der Zeile
// ("2 Spiele", "71:55 Tore", "4:0 Punkte") werden vorher entfernt.
const TAB_ZEILE = /^(\d{1,2})\.?\s+(.+?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(?:([+\-−–]?\s?\d{1,4})\s+(\d{1,4})\s*:\s*(\d{1,4})|(\d{1,4})\s*:\s*(\d{1,4})\s+([+\-−–]?\s?\d{1,4}))\s+(\d{1,3})\s*:\s*(\d{1,3})$/;
const tabellenText = (k: Knoten) => textGetrennt(k).replace(/\|/g, " ").replace(/\b(?:Spiele|Siege|Unentschieden|Niederlagen|Tore|Punkte|Sp\.)\b/gi, " ").replace(/[\s ]+/g, " ").trim();

export type NdrSeite = {
  spiele: SportDeSpiel[];
  tabellen: Map<number | null, SportDeTabellenzeile[]>;
  teams: SportDeTeam[];
  spieltage: number[]; // Abschnitte "N. Spieltag" auf der Seite
  navigation: { spieltag: number; href: string }[];
  aktuellerSpieltag: number | null; // höchster Spieltag mit mindestens einem Ergebnis
  warnungen: string[];
};

export function parseNdrSeite(html: string, k: { liga: SportDeLiga; saison: string; jetzt?: Date }): NdrSeite {
  const jetzt = k.jetzt ?? new Date();
  const start = Number(k.saison.slice(0, 4)) || jetzt.getFullYear();
  const wurzel = parseHtml(html);
  const warnungen: string[] = [];
  const rohSpiele = new Map<string, SportDeSpiel>();
  const tabellen = new Map<number | null, SportDeTabellenzeile[]>();
  const teams = new Map<string, SportDeTeam>();
  const ctx: { spiel: number | null; tabelle: number | null | undefined; datum: string | null } = { spiel: null, tabelle: undefined, datum: null };
  let nichtLesbar = 0;

  const besuche = (n: Knoten): boolean => {
    if (["script", "style", "head", "title", "noscript"].includes(n.tag)) return false;
    const text = textInhalt(n);
    if (text.length <= 60) {
      const sp = text.match(/^(?:Ergebnisse\s+)?(\d{1,2})\.\s*Spieltag$/i);
      const tab = text.match(/^Tabelle\b.{0,20}?(\d{1,2})\.\s*Spieltag$/i);
      if (sp) {
        ctx.spiel = Number(sp[1]);
        ctx.tabelle = undefined;
        ctx.datum = null;
      } else if (tab) {
        ctx.tabelle = Number(tab[1]);
        ctx.spiel = null;
      } else if (text.length <= 30) {
        const teile = zerlege(text);
        if (teile.length === 1 && teile[0].art === "datum") ctx.datum = loeseDatum(teile[0], start) ?? ctx.datum;
      }
    }
    let gefunden = false;
    for (const kind of n.kinder) if (typeof kind !== "string") gefunden = besuche(kind) || gefunden;
    if (gefunden) return true;

    // Tabellenzeile (überall erkennbar)
    const m = tabellenText(n).match(TAB_ZEILE);
    if (m) {
      const gruppe = ctx.tabelle ?? null;
      const liste = tabellen.get(gruppe) ?? [];
      const rang = Number(m[1]);
      if (!liste.some((z) => z.rang === rang)) {
        const name = m[2].trim();
        const diff = (m[7] ?? m[12]).replace(/[−–]/g, "-").replace(/\s/g, "");
        const logo = logoAusKnoten(n, NDR_PROFIL);
        liste.push({
          teamId: teamId(name),
          name,
          logoUrl: logo.url,
          rang,
          spiele: Number(m[3]),
          siege: Number(m[4]),
          unentschieden: Number(m[5]),
          niederlagen: Number(m[6]),
          torePlus: Number(m[8] ?? m[10]),
          toreMinus: Number(m[9] ?? m[11]),
          tordifferenz: Number(diff),
          punktePlus: Number(m[13]),
          punkteMinus: Number(m[14]),
          punkteRoh: `${m[13]}:${m[14]}`,
        });
        tabellen.set(gruppe, liste);
      }
      return true;
    }

    // Spielzeile (nur innerhalb eines Abschnitts "N. Spieltag")
    if (ctx.spiel !== null) {
      const roh = textGetrennt(n);
      if (roh.length >= 5 && roh.length <= 400) {
        const z = deuteNdrZeile(zerlege(roh));
        if (z && (z.heimTore !== null || z.uhrzeit)) {
          const datum = (z.datum ? loeseDatum(z.datum, start) : null) ?? ctx.datum;
          if (!datum) {
            nichtLesbar++;
            warnungen.push(`${z.heim} – ${z.gast}: Datum nicht lesbar`);
            return true;
          }
          const spieltag = ctx.spiel;
          const beginn = startZeit(datum, z.uhrzeit);
          const logos = logoAusKnoten(n, NDR_PROFIL);
          const schluessel = matchSchluessel(k.liga, start, spieltag, z.heim, z.gast);
          const status = z.status === "scheduled" && beginn && beginn.getTime() < jetzt.getTime() ? null : z.status;
          rohSpiele.set(schluessel, {
            externalMatchId: schluessel,
            matchPfad: null,
            spieltag,
            datum,
            uhrzeit: z.uhrzeit,
            startTime: beginn,
            status,
            minute: null,
            home: { externalId: teamId(z.heim), name: z.heim, logoUrl: logos.url },
            away: { externalId: teamId(z.gast), name: z.gast, logoUrl: null },
            homeScore: z.heimTore,
            awayScore: z.gastTore,
            halftimeHomeScore: z.halbzeitHeim,
            halftimeAwayScore: z.halbzeitGast,
            venue: null,
            ort: null,
            sourceUrl: null,
          });
          return true;
        }
      }
    }
    return false;
  };
  besuche(wurzel);

  // Logos der Tabelle für die Spiele, Teams aus Tabelle und Spielen
  const alleTabellenZeilen = [...tabellen.values()].flat();
  const logoJeTeam = new Map(alleTabellenZeilen.filter((z) => z.logoUrl).map((z) => [z.teamId, z.logoUrl!]));
  const spiele = [...rohSpiele.values()].map((s) => ({
    ...s,
    home: { ...s.home, logoUrl: logoJeTeam.get(s.home.externalId) ?? s.home.logoUrl },
    away: { ...s.away, logoUrl: logoJeTeam.get(s.away.externalId) ?? s.away.logoUrl },
  }));
  for (const z of alleTabellenZeilen) teams.set(z.teamId, { externalId: z.teamId, slug: null, name: z.name, shortName: null, logoUrl: z.logoUrl, league: k.liga, sourceUrl: null });
  for (const s of spiele) for (const t of [s.home, s.away]) if (!teams.has(t.externalId)) teams.set(t.externalId, { externalId: t.externalId, slug: null, name: t.name, shortName: null, logoUrl: t.logoUrl, league: k.liga, sourceUrl: null });
  if (alleTabellenZeilen.length > 0) {
    const bekannt = new Set(alleTabellenZeilen.map((z) => z.teamId));
    const fremd = [...new Set(spiele.flatMap((s) => [s.home, s.away]).filter((t) => !bekannt.has(t.externalId)).map((t) => t.name))];
    if (fremd.length > 0) warnungen.push(`Name in den Ergebnissen, aber nicht in der Tabelle: ${fremd.slice(0, 4).join(", ")}`);
  }

  const hrefs = alleMit(wurzel, "a").map((a) => attr(a, "href") ?? "").filter(Boolean);
  const navigation = findeSpieltagLinks(hrefs).map((l) => ({ spieltag: l.spieltag, href: absolutUrl(l.href, NDR_BASIS) }));
  const spieltage = [...new Set(spiele.map((s) => s.spieltag).filter((x): x is number => x !== null))].sort((a, b) => a - b);
  const mitErgebnis = spiele.filter((s) => s.homeScore !== null && s.spieltag !== null).map((s) => s.spieltag!);
  if (spiele.length === 0 && alleTabellenZeilen.length === 0) throw new SportDeLayoutFehler(NDR_PROFIL.name, "weder Spiele (Abschnitte „N. Spieltag“) noch Tabelle erkannt");
  if (nichtLesbar > 0 && nichtLesbar > spiele.length) throw new SportDeLayoutFehler(NDR_PROFIL.name, `${nichtLesbar} Spielzeilen nicht lesbar`);
  return { spiele, tabellen, teams: [...teams.values()], spieltage, navigation, aktuellerSpieltag: mitErgebnis.length ? Math.max(...mitErgebnis) : null, warnungen };
}

// Für den Sync: Spiele und Tabelle für EINEN Spieltag aus der gelesenen Seite. Seiten mit mehreren Spieltagen (2. HBL) werden auf den
// gewünschten Spieltag eingegrenzt; eine Seite mit genau einem Spieltag (1. HBL) gilt für diesen Spieltag.
export function parseNdrSpieltag(html: string, k: { liga: SportDeLiga; saison: string; spieltag: number; jetzt?: Date }) {
  const s = parseNdrSeite(html, k);
  const warnungen = [...s.warnungen];
  let spiele = s.spiele.filter((x) => x.spieltag === k.spieltag);
  if (spiele.length === 0 && s.spieltage.length === 1) {
    warnungen.push(`Seite zeigt Spieltag ${s.spieltage[0]} statt ${k.spieltag}`);
    spiele = s.spiele.filter((x) => x.spieltag === s.spieltage[0]);
  }
  if (spiele.length === 0 && s.spieltage.length > 1) warnungen.push(`Spieltag ${k.spieltag}: keine Spiele auf der Seite`);
  const tabelle = s.tabellen.get(k.spieltag) ?? (s.tabellen.size === 1 ? [...s.tabellen.values()][0] : [...s.tabellen].filter(([n]) => n !== null).sort((a, b) => (b[0] ?? 0) - (a[0] ?? 0))[0]?.[1] ?? []);
  return { spiele, tabelle: [...tabelle].sort((a, b) => a.rang - b.rang), teams: s.teams, warnungen };
}
