import { berlinOffset } from "@/lib/format";
import type { MatchStatus } from "../match";

// Gemeinsame Zeilenerkennung für Spielzeilen (Spieltagsseite, Spielübersicht, Liveticker-Kopf). Es werden keine Positionen oder CSS-Klassen
// angenommen, sondern der sichtbare Text der Zeile in Bestandteile zerlegt: Datum, Uhrzeit, Ergebnis, Halbzeitstand in Klammern,
// Spielminute, Statuswort, Spieltag und der Rest = Mannschaftsnamen.

const MUSTER = new RegExp(
  [
    String.raw`\(\s*(?<hzk1>\d{1,3})\s*:\s*(?<hzk2>\d{1,3})\s*\)`,
    String.raw`(?:Halbzeitstand|Halbzeit|HZ)\s*:?\s*\(?\s*(?<hzl1>\d{1,3})\s*:\s*(?<hzl2>\d{1,3})\s*\)?`,
    String.raw`(?<spt1>\d{1,2})\.\s?Spieltag|Spieltag\s+(?<spt2>\d{1,2})`,
    String.raw`(?<tag>\d{1,2})\.\s?(?<mon>\d{1,2})\.(?:\s?(?<jahr>\d{4}|\d{2}))?(?!\d)`,
    String.raw`(?<s1>\d{1,3})\s*:\s*(?<s2>\d{1,3})`,
    String.raw`(?<min>\d{1,3}(?:\+\d{1,2})?)\s*['′’]`,
    String.raw`\b(?<status>Beendet|Abgesagt|Verlegt|Abgebrochen|Unterbrochen|Halbzeitpause|Pause|Live|[12]\.\s?Halbzeit)\b`,
    String.raw`\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\b[.,]\s?`,
    String.raw`\bUhr\b`,
  ].join("|"),
  "gi"
);

const RAUSCHEN = new Set(["-", "–", "—", "vs", "vs.", "|", ":", "ticker", "liveticker", "live-ticker", "details", "spielbericht", "übersicht", "statistik", "zum spiel", "spieltag", "heim", "gast", "tipp", "tippen"]);

export type Zeilenteil =
  | { art: "halbzeit"; heim: number; gast: number }
  | { art: "spieltag"; wert: number }
  | { art: "datum"; tag: number; monat: number; jahr: number | null }
  | { art: "zahlenpaar"; heim: number; gast: number; roh: string }
  | { art: "minute"; wert: number }
  | { art: "status"; wert: string }
  | { art: "text"; wert: string };

export function zerlege(text: string): Zeilenteil[] {
  const teile: Zeilenteil[] = [];
  const normal = text.replace(/[\s ]+/g, " ").trim();
  let ende = 0;
  // "|" markiert Elementgrenzen (textGetrennt): getrennte Elemente sind getrennte Namen.
  const textTeil = (s: string) => {
    for (const stueck of s.split("|")) {
      const t = stueck.replace(/^[\s·•\-–—:,]+|[\s·•\-–—:,]+$/g, "").trim();
      if (t && !RAUSCHEN.has(t.toLowerCase()) && /[\p{L}\d]/u.test(t)) teile.push({ art: "text", wert: t });
    }
  };
  for (const m of normal.matchAll(MUSTER)) {
    const idx = m.index ?? 0;
    textTeil(normal.slice(ende, idx));
    ende = idx + m[0].length;
    const g = m.groups ?? {};
    if (g.hzk1 !== undefined) teile.push({ art: "halbzeit", heim: Number(g.hzk1), gast: Number(g.hzk2) });
    else if (g.hzl1 !== undefined) teile.push({ art: "halbzeit", heim: Number(g.hzl1), gast: Number(g.hzl2) });
    else if (g.spt1 !== undefined || g.spt2 !== undefined) teile.push({ art: "spieltag", wert: Number(g.spt1 ?? g.spt2) });
    else if (g.tag !== undefined) teile.push({ art: "datum", tag: Number(g.tag), monat: Number(g.mon), jahr: g.jahr ? (g.jahr.length === 2 ? 2000 + Number(g.jahr) : Number(g.jahr)) : null });
    else if (g.s1 !== undefined) teile.push({ art: "zahlenpaar", heim: Number(g.s1), gast: Number(g.s2), roh: m[0] });
    else if (g.min !== undefined) teile.push({ art: "minute", wert: Number.parseInt(g.min, 10) });
    else if (g.status !== undefined) teile.push({ art: "status", wert: g.status });
    // Wochentag und "Uhr": Rauschen
  }
  textTeil(normal.slice(ende));
  return teile;
}

// Status aus dem sichtbaren Wort; unbekannte Wörter -> null (NIE automatisch "beendet").
export function mappeStatus(wort: string | null | undefined): MatchStatus | null {
  if (!wort) return null;
  const w = wort.toLowerCase().replace(/\s+/g, "");
  if (w === "beendet") return "finished";
  if (w === "pause" || w === "halbzeitpause") return "halftime";
  if (w === "1.halbzeit" || w === "2.halbzeit" || w === "live") return "live";
  if (w === "abgesagt") return "cancelled";
  if (w === "verlegt") return "postponed";
  if (w === "abgebrochen" || w === "unterbrochen") return "interrupted";
  return null;
}

export type Spielzeile = {
  heim: string;
  gast: string;
  status: MatchStatus | null;
  statusText: string | null;
  minute: number | null;
  datum: { tag: number; monat: number; jahr: number | null } | null;
  uhrzeit: string | null;
  heimTore: number | null;
  gastTore: number | null;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  spieltag: number | null;
};

const uhrzeitText = (h: number, m: number) => (h <= 23 && m <= 59 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null);

// Deutet die Bestandteile als Spielzeile: genau zwei Namen (Heim, Gast). Ein "d:d" ZWISCHEN den Namen ist das Ergebnis, sobald das Spiel
// begonnen hat (Statuswort Beendet/Pause/Halbzeit/Live oder eine Spielminute), sonst die Anstoßzeit; ein "d:d" außerhalb ist die Uhrzeit.
export function deuteSpielzeile(teile: Zeilenteil[]): Spielzeile | null {
  const namen = teile.map((t, i) => ({ t, i })).filter((x): x is { t: Extract<Zeilenteil, { art: "text" }>; i: number } => x.t.art === "text");
  let heim: string;
  let gast: string;
  let i1: number;
  let i2: number;
  if (namen.length === 2) {
    heim = namen[0].t.wert;
    gast = namen[1].t.wert;
    i1 = namen[0].i;
    i2 = namen[1].i;
  } else if (namen.length === 1) {
    const geteilt = namen[0].t.wert.split(/\s+[-–—]\s+|\s+vs\.?\s+/i);
    if (geteilt.length !== 2) return null;
    [heim, gast] = geteilt.map((x) => x.trim());
    i1 = i2 = namen[0].i;
  } else return null;
  if (!heim || !gast) return null;

  const status = teile.find((t): t is Extract<Zeilenteil, { art: "status" }> => t.art === "status");
  const minute = teile.find((t): t is Extract<Zeilenteil, { art: "minute" }> => t.art === "minute");
  let st = status ? mappeStatus(status.wert) : null;
  if (!st && minute) st = "live";
  const begonnen = st === "finished" || st === "live" || st === "halftime" || st === "interrupted";

  const z: Spielzeile = {
    heim,
    gast,
    status: st,
    statusText: status?.wert ?? null,
    minute: minute?.wert ?? null,
    datum: null,
    uhrzeit: null,
    heimTore: null,
    gastTore: null,
    halbzeitHeim: null,
    halbzeitGast: null,
    spieltag: null,
  };
  for (const t of teile) {
    if (t.art === "halbzeit") {
      z.halbzeitHeim = t.heim;
      z.halbzeitGast = t.gast;
    } else if (t.art === "spieltag") z.spieltag ??= t.wert;
    else if (t.art === "datum" && !z.datum) z.datum = { tag: t.tag, monat: t.monat, jahr: t.jahr };
  }

  // Zahlenpaare ("31:32", "16:17", "19:00") deuten:
  //  - Spiel begonnen (Statuswort/Minute): Ergebnis = das Paar zwischen den Namen, sonst das erste; ein weiteres Paar, das nicht größer als das
  //    Ergebnis ist, ist der Halbzeitstand (auch ohne Klammern), sonst eine Uhrzeit.
  //  - Spiel nicht begonnen: ein Paar zwischen den Namen ist die Anstoßzeit, ebenso jedes weitere gültige Zeitpaar.
  const paare = teile.map((t, i) => ({ t, i })).filter((x): x is { t: Extract<Zeilenteil, { art: "zahlenpaar" }>; i: number } => x.t.art === "zahlenpaar");
  const zwischen = (i: number) => i1 !== i2 && i > i1 && i < i2;
  if (begonnen) {
    const ergebnis = paare.find((x) => zwischen(x.i)) ?? paare[0];
    if (ergebnis) {
      z.heimTore = ergebnis.t.heim;
      z.gastTore = ergebnis.t.gast;
    }
    for (const x of paare) {
      if (x === ergebnis) continue;
      if (z.halbzeitHeim === null && z.heimTore !== null && x.t.heim <= z.heimTore && x.t.gast <= (z.gastTore ?? 0)) {
        z.halbzeitHeim = x.t.heim;
        z.halbzeitGast = x.t.gast;
      } else if (!z.uhrzeit) z.uhrzeit = uhrzeitText(x.t.heim, x.t.gast);
    }
  } else {
    for (const x of paare) if (!z.uhrzeit) z.uhrzeit = uhrzeitText(x.t.heim, x.t.gast);
  }
  return z;
}

export const parseSpielzeile = (text: string) => deuteSpielzeile(zerlege(text));

// Datum auflösen: ohne Jahr gehört der Monat Juli–Dezember zum Saisonstartjahr, Januar–Juni zum Folgejahr.
export function loeseDatum(d: { tag: number; monat: number; jahr: number | null }, saisonStartJahr: number): string | null {
  if (d.monat < 1 || d.monat > 12 || d.tag < 1 || d.tag > 31) return null;
  const jahr = d.jahr ?? (d.monat >= 7 ? saisonStartJahr : saisonStartJahr + 1);
  return `${jahr}-${String(d.monat).padStart(2, "0")}-${String(d.tag).padStart(2, "0")}`;
}

export function startZeit(datum: string | null, uhrzeit: string | null): Date | null {
  return datum && uhrzeit ? new Date(`${datum}T${uhrzeit}:00${berlinOffset(datum)}`) : null;
}

// "2025/26" -> 2025
export const saisonStartJahr = (saison: string): number => Number(saison.slice(0, 4)) || new Date().getFullYear();
