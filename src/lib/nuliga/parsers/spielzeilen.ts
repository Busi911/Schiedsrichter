import { berlinOffset } from "@/lib/format";
import {
  attribut,
  normalisiereSpaltenkopf,
  paramsAusUrl,
  parseDoppelwert,
  tabellen,
  textVon,
  zeilen,
  zellen,
  type Zelle,
} from "../html";
import type { NuligaSpiel, SpielStatus } from "../types";

// Parser für die Spielplan-Tabelle, die in groupPage, teamPortrait und
// clubInfoDisplay identisch aufgebaut ist (Spaltenköpfe: Tag, Datum, Zeit,
// Ort, Nr., [Liga], Heimmannschaft, Gastmannschaft, <Ergebnis>, ...).
//
// DATENSCHUTZ: Die Ergebnis-Spalte enthält bei noch nicht gespielten Spielen
// ein <span title="Nachname Vorname"> mit dem angesetzten Schiedsrichter.
// Ein Ergebnis wird deshalb AUSSCHLIESSLICH aus dem Text eines
// "...MeetingReport"-Links gelesen (bzw. aus der kleinen Whitelist an
// Wertungs-Codes) — niemals aus dem übrigen Zelleninhalt.

const WERTUNGS_CODES = new Set(["NH", "NG"]); // Heim-/Gastmannschaft nicht angetreten

function parseDatum(text: string): string | null {
  const t = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return t ? `${t[3]}-${t[2]}-${t[1]}` : null;
}

function bauBeginn(datumIso: string, uhrzeit: string | null): Date | null {
  if (!uhrzeit) return null;
  const hhmm = uhrzeit.padStart(5, "0");
  return new Date(`${datumIso}T${hhmm}:00${berlinOffset(datumIso)}`);
}

function parseHalle(zelle: Zelle | undefined): NuligaSpiel["halle"] {
  if (!zelle) return null;
  const span = zelle.html.match(/<span\b[^>]*>/i)?.[0];
  const name = span ? (attribut(span, "title") ?? attribut(span, "alt")) : null;
  const anker = zelle.html.match(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
  const nuligaId = anker ? (paramsAusUrl(anker[1]).get("location") ?? null) : null;
  const nummer = anker ? textVon(anker[2]) || null : null;
  if (!name && !nummer && !nuligaId) return null;
  return { name: name || null, nummer, nuligaId };
}

// Relativer Link (Pfad + Query) zum Spielbericht. Absolute Links werden auf Pfad+Query gekürzt, damit nie
// eine fremde Domain gespeichert wird; die Domain setzt die Anzeige aus dem Verband.
export function berichtPfad(href: string): string | null {
  const roh = href.replace(/&amp;/g, "&").trim();
  try {
    const u = new URL(roh, "https://nuliga.invalid");
    if (!/MeetingReport$/i.test(u.pathname)) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function parseErgebnis(zelle: Zelle | undefined): {
  meetingId: string | null;
  berichtUrl: string | null;
  gruppenId: string | null;
  tore: NuligaSpiel["tore"];
  halbzeit: NuligaSpiel["halbzeit"];
  code: string | null;
} {
  const leer = { meetingId: null, berichtUrl: null, gruppenId: null, tore: null, halbzeit: null, code: null };
  if (!zelle) return leer;

  const anker = zelle.html.match(
    /<a\b[^>]*href\s*=\s*"([^"]*MeetingReport[^"]*)"[^>]*>([\s\S]*?)<\/a>/i
  );
  if (anker) {
    const params = paramsAusUrl(anker[1]);
    const halbzeitText =
      anker[2].match(/(?:title|alt)\s*=\s*"(\d+:\d+)\s+zur Halbzeit"/i)?.[1] ?? null;
    return {
      meetingId: params.get("meeting"),
      berichtUrl: berichtPfad(anker[1]),
      gruppenId: params.get("group"),
      tore: parseDoppelwert(textVon(anker[2])),
      halbzeit: halbzeitText ? parseDoppelwert(halbzeitText) : null,
      code: null,
    };
  }

  const code = zelle.text.replace(/\s+/g, "").toUpperCase();
  return { ...leer, code: WERTUNGS_CODES.has(code) ? code : null };
}

// Nur Zählwerte und Spaltenköpfe, keine Inhalte der Zellen (keine Personendaten).
export type SpielplanDiagnose = {
  tabellen: number; // <table> im HTML
  koepfe: string[][]; // normalisierte Spaltenköpfe je Tabelle mit Kopfzeile
  erkannteTabellen: number; // Tabellen mit Datum/Zeit/Heim/Gast
  kandidaten: number; // Datenzeilen in erkannten Tabellen
  mitSpielnummer: number; // numerische Spielnummer
  ohneSpielnummer: number; // Zelle leer
  ungueltigeSpielnummer: number; // Zelle nicht rein numerisch (wird NICHT geraten)
  mitMeetingId: number;
  verworfen: Record<string, number>; // Grund -> Anzahl
};

// Bekannte Kopf-Schreibweisen -> Spaltenname.
const KOPF_ALIASSE: Record<string, string> = {
  heim: "heimmannschaft",
  gast: "gastmannschaft",
};

// Zeilen als Raster: colspan wiederholt die Zelle, rowspan trägt sie in die Folgezeilen weiter,
// damit die Spaltennummern des Kopfs stimmen.
function rasterZeilen(alleZeilen: string[]): Zelle[][] {
  const offen = new Map<number, { zelle: Zelle; rest: number }>();
  return alleZeilen.map((zeile) => {
    const roh = zellen(zeile);
    const aus: Zelle[] = [];
    let nächste = 0;
    const setzeOffene = () => {
      for (let o = offen.get(aus.length); o; o = offen.get(aus.length)) {
        aus.push(o.zelle);
        o.rest--;
        if (o.rest <= 0) offen.delete(aus.length - 1);
      }
    };
    setzeOffene();
    while (nächste < roh.length) {
      const z = roh[nächste++];
      const cols = Math.min(Math.max(Number(attribut(z.oeffnung, "colspan")) || 1, 1), 20);
      const rows = Math.min(Math.max(Number(attribut(z.oeffnung, "rowspan")) || 1, 1), 50);
      for (let c = 0; c < cols; c++) {
        if (rows > 1) offen.set(aus.length, { zelle: z, rest: rows - 1 });
        aus.push(z);
        setzeOffene();
      }
    }
    return aus;
  });
}

function leereDiagnose(): SpielplanDiagnose {
  return {
    tabellen: 0,
    koepfe: [],
    erkannteTabellen: 0,
    kandidaten: 0,
    mitSpielnummer: 0,
    ohneSpielnummer: 0,
    ungueltigeSpielnummer: 0,
    mitMeetingId: 0,
    verworfen: {},
  };
}

export function parseSpielTabellen(html: string): {
  spiele: NuligaSpiel[];
  warnungen: string[];
  diagnose: SpielplanDiagnose;
} {
  const spiele: NuligaSpiel[] = [];
  const warnungen: string[] = [];
  const diagnose = leereDiagnose();
  const verwirf = (grund: string) => {
    diagnose.verworfen[grund] = (diagnose.verworfen[grund] ?? 0) + 1;
  };
  const alleTabellen = tabellen(html);
  diagnose.tabellen = alleTabellen.length;

  for (const tabelle of alleTabellen) {
    const zeilenRoh = zeilen(tabelle);
    const alleZeilen = rasterZeilen(zeilenRoh);
    const kopfIndex = zeilenRoh.findIndex((z) => /<th\b/i.test(z));
    if (kopfIndex < 0) continue;
    const kopf = alleZeilen[kopfIndex].map((z) => {
      const k = normalisiereSpaltenkopf(z.text);
      return KOPF_ALIASSE[k] ?? k;
    });
    diagnose.koepfe.push(kopf);
    const idx = {
      datum: kopf.indexOf("datum"),
      zeit: kopf.indexOf("zeit"),
      ort: kopf.indexOf("ort"),
      nr: kopf.indexOf("nr."),
      liga: kopf.indexOf("liga"),
      heim: kopf.indexOf("heimmannschaft"),
      gast: kopf.indexOf("gastmannschaft"),
    };
    if (idx.datum < 0 || idx.zeit < 0 || idx.heim < 0 || idx.gast < 0) continue;
    diagnose.erkannteTabellen++;
    const ergebnisIndex = idx.gast + 1;

    // Datum steht bei mehreren Spielen am selben Tag nur in der ersten Zeile
    // (Folgezeilen haben leere "tabelle-rowspan"-Zellen) — mitführen.
    let aktuellesDatum: string | null = null;

    for (let zi = 0; zi < alleZeilen.length; zi++) {
      if (/<th\b/i.test(zeilenRoh[zi])) continue;
      const z = alleZeilen[zi];
      if (z.length <= idx.gast) {
        verwirf("zu wenige Spalten");
        continue;
      }
      diagnose.kandidaten++;

      aktuellesDatum = parseDatum(z[idx.datum]?.text ?? "") ?? aktuellesDatum;
      if (!aktuellesDatum) {
        warnungen.push("Spielzeile ohne Datum übersprungen");
        verwirf("ohne Datum");
        continue;
      }

      const zeitZelle = z[idx.zeit];
      const uhrzeit = zeitZelle.text.match(/(\d{1,2}:\d{2})/)?.[1] ?? null;
      const marker = zeitZelle.text.replace(/\d{1,2}:\d{2}/, "").trim().toLowerCase();
      const verlegtHinweis = attribut(zeitZelle.oeffnung, "title") ?? "";
      const urspruenglich = verlegtHinweis.match(
        /ursprünglicher Termin:\s*\S*\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2}:\d{2})/i
      );
      const urspruenglicherBeginn = urspruenglich
        ? bauBeginn(parseDatum(urspruenglich[1])!, urspruenglich[2])
        : null;

      // Text ist bereits von geschützten Leerzeichen/Mehrfach-Leerraum bereinigt; nur rein Numerisches
      // zählt als Spielnummer (nie Ziffern aus fremdem Text raten).
      const nrText = idx.nr >= 0 ? (z[idx.nr]?.text ?? "").replace(/[\s\u00a0]+/g, " ").trim() : "";
      const nr = /^\d+$/.test(nrText) ? nrText : undefined;
      if (nr) diagnose.mitSpielnummer++;
      else if (nrText === "") diagnose.ohneSpielnummer++;
      else diagnose.ungueltigeSpielnummer++;
      const ergebnis = parseErgebnis(z[ergebnisIndex]);
      // Meeting-ID auch aus einem sonstigen Spielbericht-Link der Zeile (nur gelesen, nicht abgerufen).
      const meetingId =
        ergebnis.meetingId ??
        z
          .map((c) => c.html.match(/<a\b[^>]*href\s*=\s*"([^"]*MeetingReport[^"]*)"/i)?.[1])
          .filter((h): h is string => !!h)
          .map((h) => paramsAusUrl(h).get("meeting"))
          .find((m): m is string => !!m) ??
        null;
      if (meetingId) diagnose.mitMeetingId++;

      const letzteZellen = z.slice(ergebnisIndex + 1);
      const bestaetigt = letzteZellen.some((c) => /Spielbericht genehmigt/i.test(c.html));
      const abgesagt = letzteZellen.some((c) => /Spielabsage/i.test(c.html));
      // nuLiga zeigt "0:0" schon, sobald der Spielbericht angelegt ist (vor/während des Spiels). Ein echtes
      // 0:0 gibt es im Handball nicht: ein Nichtantritt steht als Wertungs-Code (NH/NG, siehe parseErgebnis).
      // Ein 0:0 ist also immer nur der Platzhalter: noch kein Ergebnis.
      if (ergebnis.tore && ergebnis.tore.plus === 0 && ergebnis.tore.minus === 0) {
        ergebnis.tore = null;
        ergebnis.halbzeit = null;
      }
      let status: SpielStatus = "geplant";
      if (ergebnis.tore) status = "gespielt";
      else if (ergebnis.code) status = "nicht_angetreten";
      else if (abgesagt || marker === "x") status = "abgesagt";
      else if (marker === "v" || urspruenglicherBeginn) status = "verlegt";

      const heim = z[idx.heim].text;
      const gast = z[idx.gast].text;
      if (!heim || !gast) {
        warnungen.push(`Spiel ${nr ?? "?"} am ${aktuellesDatum} ohne Heim/Gast übersprungen`);
        verwirf("ohne Heim/Gast");
        continue;
      }

      spiele.push({
        spielnummer: nr ? Number(nr) : null,
        meetingId,
        berichtUrl: ergebnis.berichtUrl,
        gruppenId: ergebnis.gruppenId,
        datum: aktuellesDatum,
        uhrzeit,
        beginn: bauBeginn(aktuellesDatum, uhrzeit),
        urspruenglicherBeginn,
        halle: idx.ort >= 0 ? parseHalle(z[idx.ort]) : null,
        ligaKuerzel: idx.liga >= 0 ? z[idx.liga]?.text || null : null,
        heim,
        gast,
        tore: ergebnis.tore,
        halbzeit: ergebnis.halbzeit,
        ergebnisBestaetigt: bestaetigt,
        status,
      });
    }
  }

  return { spiele, warnungen, diagnose };
}
