import type { SportDeLiga } from "../match";
import { nachfahren, parseHtml, textGetrennt, textInhalt, type Knoten } from "./html";
import { deuteSpielzeile, loeseDatum, saisonStartJahr, startZeit, zerlege, type Spielzeile } from "./zeile";
import { teamIdAusNamen, vollUrl } from "./urls";
import { SportDeLayoutFehler, type SportDeSpiel } from "./types";

// Spielübersicht (…/ma<ID>/<teams>/uebersicht/) und Kopf des Livetickers: der Kopf mit Heim, Gast, Ergebnis/Uhrzeit, Status und
// Halbzeitstand wird als innerste Zeile gesucht, die sich als Spielzeile lesen lässt; Spielort und Ort stehen unter "Spieldaten" als
// Beschriftung + Wert.

export type SpielKopf = { zeile: Spielzeile; knoten: Knoten };

const informationsgehalt = (z: Spielzeile) =>
  Number(z.heimTore !== null) + Number(z.status !== null) + Number(z.halbzeitHeim !== null) + Number(!!z.datum) + Number(!!z.uhrzeit) + Number(z.spieltag !== null) + Number(z.minute !== null);

// Der Kopf ist die informationsreichste kleine Zeile mit zwei Namen (bei Gleichstand die kürzeste): nur mit Status und Halbzeitstand lässt sich
// ein "18:17" sicher deuten.
export function findeSpielKopf(wurzel: Knoten): SpielKopf | null {
  let beste: SpielKopf | null = null;
  let besterGehalt = -1;
  let kuerzeste = Infinity;
  for (const n of nachfahren(wurzel)) {
    if (["script", "style", "head", "title"].includes(n.tag)) continue;
    const text = textGetrennt(n);
    if (text.length > 480 || text.length < 5) continue;
    // Ereigniszeilen des Livetickers ("58' | Tor für …") sind nie der Spielkopf.
    if (/^[|\s]*\d{1,3}(?:\+\d{1,2})?\s*['′’]/.test(text)) continue;
    const z = deuteSpielzeile(zerlege(text));
    // Der Kopf hat zwei Namen UND mindestens Ergebnis, Status oder Uhrzeit.
    if (!z || (z.heimTore === null && !z.status && !z.uhrzeit)) continue;
    const gehalt = informationsgehalt(z);
    if (gehalt > besterGehalt || (gehalt === besterGehalt && text.length < kuerzeste)) {
      besterGehalt = gehalt;
      kuerzeste = text.length;
      beste = { zeile: z, knoten: n };
    }
  }
  return beste;
}

// Wert zu einer Beschriftung ("Spielort", "Ort"): im selben Element ("Spielort: Halle X"), sonst im nächsten Geschwisterelement.
export function wertNachBeschriftung(wurzel: Knoten, beschriftung: string): string | null {
  const roh = beschriftung.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const gleich = new RegExp(`^${roh}\\s*:\\s*(.{2,120})$`, "i");
  const nur = new RegExp(`^${roh}\\s*:?$`, "i");
  for (const n of nachfahren(wurzel)) {
    const text = textInhalt(n);
    if (text.length > 160) continue;
    const m = text.match(gleich);
    if (m && n.kinder.length <= 3) return m[1].trim();
    if (nur.test(text) && n.eltern) {
      const geschwister = n.eltern.kinder;
      const i = geschwister.indexOf(n);
      for (let j = i + 1; j < geschwister.length; j++) {
        const g = geschwister[j];
        const t = typeof g === "string" ? g.trim() : textInhalt(g);
        if (t) return t.slice(0, 120);
      }
    }
  }
  return null;
}

export function parseSpielUebersichtHtml(html: string, k: { liga: SportDeLiga; saison: string; externalMatchId: string; pfad: string | null }): SportDeSpiel {
  const wurzel = parseHtml(html);
  const kopf = findeSpielKopf(wurzel);
  if (!kopf) throw new SportDeLayoutFehler("kein Spielkopf (Heim, Gast, Ergebnis/Uhrzeit, Status) gefunden");
  const z = kopf.zeile;
  const start = saisonStartJahr(k.saison);
  // Datum, Spieltag und Uhrzeit stehen oft außerhalb der Kopfzeile: nächste Vorfahren absuchen. Die Uhrzeit ist das Zahlenpaar direkt
  // hinter dem Datum ("04.10.2025 19:00").
  let datum = z.datum;
  let uhrzeit = z.uhrzeit;
  let spieltag = z.spieltag;
  for (let a: Knoten | null = kopf.knoten.eltern, i = 0; a && i < 4 && (!datum || !spieltag || !uhrzeit); a = a.eltern, i++) {
    const t = textGetrennt(a);
    if (t.length > 900) break;
    const teile = zerlege(t);
    const di = teile.findIndex((x) => x.art === "datum");
    if (di >= 0) {
      const d = teile[di];
      if (!datum && d.art === "datum") datum = { tag: d.tag, monat: d.monat, jahr: d.jahr };
      const naechster = teile[di + 1];
      if (!uhrzeit && naechster?.art === "zahlenpaar" && naechster.heim <= 23 && naechster.gast <= 59) {
        uhrzeit = `${String(naechster.heim).padStart(2, "0")}:${String(naechster.gast).padStart(2, "0")}`;
      }
    }
    const sp = teile.find((x) => x.art === "spieltag");
    if (!spieltag && sp?.art === "spieltag") spieltag = sp.wert;
  }
  const datumIso = datum ? loeseDatum(datum, start) : null;
  return {
    externalMatchId: k.externalMatchId,
    matchPfad: k.pfad,
    spieltag,
    datum: datumIso,
    uhrzeit,
    startTime: startZeit(datumIso, uhrzeit),
    status: z.status,
    minute: z.minute,
    home: { externalId: teamIdAusNamen(z.heim), name: z.heim, logoUrl: null },
    away: { externalId: teamIdAusNamen(z.gast), name: z.gast, logoUrl: null },
    homeScore: z.heimTore,
    awayScore: z.gastTore,
    halftimeHomeScore: z.halbzeitHeim,
    halftimeAwayScore: z.halbzeitGast,
    venue: wertNachBeschriftung(wurzel, "Spielort"),
    ort: wertNachBeschriftung(wurzel, "Ort"),
    sourceUrl: k.pfad ? vollUrl(k.pfad) : null,
  };
}
