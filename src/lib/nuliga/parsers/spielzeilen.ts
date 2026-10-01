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

function parseErgebnis(zelle: Zelle | undefined): {
  meetingId: string | null;
  gruppenId: string | null;
  tore: NuligaSpiel["tore"];
  halbzeit: NuligaSpiel["halbzeit"];
  code: string | null;
} {
  const leer = { meetingId: null, gruppenId: null, tore: null, halbzeit: null, code: null };
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
      gruppenId: params.get("group"),
      tore: parseDoppelwert(textVon(anker[2])),
      halbzeit: halbzeitText ? parseDoppelwert(halbzeitText) : null,
      code: null,
    };
  }

  const code = zelle.text.replace(/\s+/g, "").toUpperCase();
  return { ...leer, code: WERTUNGS_CODES.has(code) ? code : null };
}

export function parseSpielTabellen(html: string): { spiele: NuligaSpiel[]; warnungen: string[] } {
  const spiele: NuligaSpiel[] = [];
  const warnungen: string[] = [];

  for (const tabelle of tabellen(html)) {
    const alleZeilen = zeilen(tabelle);
    const kopfZeile = alleZeilen.find((z) => /<th\b/i.test(z));
    if (!kopfZeile) continue;
    const kopf = zellen(kopfZeile).map((z) => normalisiereSpaltenkopf(z.text));
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
    const ergebnisIndex = idx.gast + 1;

    // Datum steht bei mehreren Spielen am selben Tag nur in der ersten Zeile
    // (Folgezeilen haben leere "tabelle-rowspan"-Zellen) — mitführen.
    let aktuellesDatum: string | null = null;

    for (const zeile of alleZeilen) {
      if (/<th\b/i.test(zeile)) continue;
      const z = zellen(zeile);
      if (z.length <= idx.gast) continue;

      aktuellesDatum = parseDatum(z[idx.datum]?.text ?? "") ?? aktuellesDatum;
      if (!aktuellesDatum) {
        warnungen.push("Spielzeile ohne Datum übersprungen");
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

      const nr = idx.nr >= 0 ? z[idx.nr]?.text.match(/^\d+$/)?.[0] : undefined;
      const ergebnis = parseErgebnis(z[ergebnisIndex]);

      const letzteZellen = z.slice(ergebnisIndex + 1);
      const bestaetigt = letzteZellen.some((c) => /Spielbericht genehmigt/i.test(c.html));
      const abgesagt = letzteZellen.some((c) => /Spielabsage/i.test(c.html));

      let status: SpielStatus = "geplant";
      if (ergebnis.tore) status = "gespielt";
      else if (ergebnis.code) status = "nicht_angetreten";
      else if (abgesagt || marker === "x") status = "abgesagt";
      else if (marker === "v" || urspruenglicherBeginn) status = "verlegt";

      const heim = z[idx.heim].text;
      const gast = z[idx.gast].text;
      if (!heim || !gast) {
        warnungen.push(`Spiel ${nr ?? "?"} am ${aktuellesDatum} ohne Heim/Gast übersprungen`);
        continue;
      }

      spiele.push({
        spielnummer: nr ? Number(nr) : null,
        meetingId: ergebnis.meetingId,
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

  return { spiele, warnungen };
}
