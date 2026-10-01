import { slugify } from "@/lib/nuliga/normalisierung";

// Reiner (DB-freier) Abgleich: gehört ein bestehender Hallenplan-Termin
// (termine.typ = 'rundenspiel', Import über die Hallen-ID) zu einem Spiel der
// öffentlichen Liga-Daten (liga_spiel)? Basis für die spätere Vereinheitlichung
// der beiden Wege (Schritt 1: nur Bericht, es wird nichts verändert).

export type AbgleichTermin = {
  id: string;
  start: Date;
  icsUid: string | null;
  heim: string | null;
  gast: string | null;
  // Rohtext aus dem Hallenplan, z.B. "mJC", "wJD", "Mä/männl.", "Fr/weibl."
  kategorie: string | null;
  // false = Freundschaftsspiel/Turnier (keine Verbandsspielnummer), null/true sonst
  pflichtspiel?: boolean | null;
};

export type AbgleichSpiel = {
  id: string;
  spielnummer: number | null;
  datum: string; // YYYY-MM-DD (Berliner Tag)
  uhrzeit: string | null; // "HH:MM" (Berliner Zeit), nur Tie-Breaker
  // Aus der Liga-Gruppe (liga_gruppe): "m" | "w" | "gemischt" | null,
  // Altersklasse "A".."F" bzw. null (Erwachsene/unbekannt).
  geschlecht: string | null;
  altersklasse: string | null;
  heimName: string;
  gastName: string;
};

export type AbgleichStatus = "sicher" | "unklar" | "mehrdeutig" | "kein_treffer";

export type AbgleichErgebnis = {
  terminId: string;
  status: AbgleichStatus;
  spielIds: string[];
};

const ROEMISCH: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

// Vergleichsform eines Mannschaftsnamens. Gleich vergleichen sollen:
// - "HSG Test II" und "HSG Test 2" (römisch/arabisch),
// - "TSF Heuchelheim 1" und "TSF Heuchelheim" (erste Mannschaft ohne Nummer),
// - "mJSG Bieber/Heuchelheim" und "mJSG Heuchelheim/Bieber" (Reihenfolge der
//   Spielgemeinschafts-Partner ist je Quelle verschieden).
export function normalisiereName(name: string | null): string {
  if (!name) return "";
  const teile = slugify(name).split("-").filter(Boolean);
  const letzte = teile[teile.length - 1];
  if (teile.length > 1 && letzte && ROEMISCH[letzte]) teile[teile.length - 1] = ROEMISCH[letzte];
  if (teile.length > 1 && teile[teile.length - 1] === "1") teile.pop();
  // Partner einer Spielgemeinschaft ("a/b") sortieren: slugify macht "/" zu "-",
  // daher vor dem Slugify am Original trennen.
  const hatSchraegstrich = name.includes("/");
  if (!hatSchraegstrich) return teile.join("-");
  const [vorne, ...rest] = name.trim().split(/\s+/);
  const ohneNummer = rest.join(" ");
  const nummer = ohneNummer.match(/\s+(VI|V|IV|III|II|I|\d{1,2})$/i)?.[1] ?? "";
  const kern = nummer ? ohneNummer.slice(0, ohneNummer.length - nummer.length).trim() : ohneNummer;
  const nr = nummer ? (ROEMISCH[nummer.toLowerCase()] ?? nummer) : "";
  // Präfix (z.B. "mJSG") kann ohne Leerzeichen am ersten Partner hängen: Wörter
  // mit "/" sind die Partner, alles davor ist Präfix.
  const wortTeile = (vorne + " " + kern).trim().split(/\s+/);
  const idx = wortTeile.findIndex((w) => w.includes("/"));
  const praefix = wortTeile.slice(0, Math.max(idx, 0)).join(" ");
  const partner = wortTeile.slice(Math.max(idx, 0)).join(" ").split("/").map((x) => slugify(x)).sort();
  return [slugify(praefix), ...partner, nr && nr !== "1" ? nr : ""].filter(Boolean).join("-");
}

// Spielnummer aus der Termin-UID (siehe bildeUid in rundenspiel-import.ts):
// "rundenspiel:{Halle}:{Heim}:{Gast}:{Nummer}" — die Variante ohne echte
// Nummer trägt stattdessen Datum/Zeit und liefert hier null.
export function spielnummerAusUid(uid: string | null): number | null {
  if (!uid || !uid.startsWith("rundenspiel:")) return null;
  const teile = uid.slice("rundenspiel:".length).split(":");
  if (teile.length < 4 || /^\d{4}-\d{2}-\d{2}$/.test(teile[1] ?? "")) return null;
  const nummer = teile[teile.length - 1];
  return /^\d+$/.test(nummer) && nummer !== "0" ? Number(nummer) : null;
}

const berlinTag = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Geschlecht + Altersklasse aus dem Hallenplan-Kategorietext. null = nicht
// auswertbar (dann gilt keine Einschränkung); altersklasse null = Erwachsene.
export function parseKategorie(
  kategorie: string | null
): { geschlecht: "m" | "w"; altersklasse: string | null } | null {
  if (!kategorie) return null;
  const jugend = kategorie.trim().match(/^([mw])\s*J\s*([A-F])\b/i);
  if (jugend) return { geschlecht: jugend[1].toLowerCase() as "m" | "w", altersklasse: jugend[2].toUpperCase() };
  if (/^(mä|männ|her)/i.test(kategorie.trim())) return { geschlecht: "m", altersklasse: null };
  if (/^(fr|frau|dam|weibl)/i.test(kategorie.trim())) return { geschlecht: "w", altersklasse: null };
  return null;
}

// Passen Altersklasse/Geschlecht von Termin und Liga-Spiel zusammen? Fehlt auf
// einer Seite die Information, gilt keine Einschränkung — widersprechen sie
// sich sicher (z.B. mJC gegen mJD), ist es nie dasselbe Spiel.
export function passtKategorie(t: AbgleichTermin, s: AbgleichSpiel): boolean {
  const k = parseKategorie(t.kategorie);
  if (!k) return true;
  if (s.geschlecht === "m" || s.geschlecht === "w") {
    if (s.geschlecht !== k.geschlecht) return false;
    if (s.altersklasse !== k.altersklasse) return false;
  }
  return true;
}

const MAX_VERLEGUNG_TAGE = 60;

function tageAbstand(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;
}

const berlinUhr = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function gleicheMannschaften(t: AbgleichTermin, s: AbgleichSpiel): boolean {
  return (
    passtKategorie(t, s) &&
    normalisiereName(t.heim) !== "" &&
    normalisiereName(t.heim) === normalisiereName(s.heimName) &&
    normalisiereName(t.gast) === normalisiereName(s.gastName)
  );
}

export function gleicheMannschaftenVertauscht(t: AbgleichTermin, s: AbgleichSpiel): boolean {
  return (
    passtKategorie(t, s) &&
    normalisiereName(t.heim) !== "" &&
    normalisiereName(t.heim) === normalisiereName(s.gastName) &&
    normalisiereName(t.gast) === normalisiereName(s.heimName)
  );
}

// sicher: genau ein Spiel mit gleichen Mannschaften UND (gleiche Spielnummer
// ODER gleicher Tag). mehrdeutig: mehrere solche Spiele. unklar: kein solches,
// aber ein Spiel mit gleicher Spielnummer bzw. gleichen Mannschaften an einem
// anderen Tag (z.B. verlegt) — wird nie automatisch verknüpft.
export function gleicheAb(termine: AbgleichTermin[], spiele: AbgleichSpiel[]): AbgleichErgebnis[] {
  return termine.map((t) => {
    const nummer = spielnummerAusUid(t.icsUid);
    const tag = berlinTag.format(t.start);
    const uhr = berlinUhr.format(t.start);
    const sicher = spiele.filter(
      (s) =>
        gleicheMannschaften(t, s) &&
        ((nummer !== null && s.spielnummer === nummer) || s.datum === tag)
    );
    if (sicher.length === 1) return { terminId: t.id, status: "sicher", spielIds: [sicher[0].id] };
    if (sicher.length > 1) {
      // Gleiche Mannschaftsnamen an einem Tag (z.B. zwei Altersklassen einer
      // Spielgemeinschaft gegen denselben Gegner): die Uhrzeit entscheidet.
      const gleicheUhr = sicher.filter((s) => s.uhrzeit === uhr);
      if (gleicheUhr.length === 1) {
        return { terminId: t.id, status: "sicher", spielIds: [gleicheUhr[0].id] };
      }
      return { terminId: t.id, status: "mehrdeutig", spielIds: sicher.map((s) => s.id) };
    }
    // Vage: gleiche Mannschaften an einem anderen Tag (z.B. verlegt) oder mit
    // vertauschtem Heimrecht bei gleicher Spielnummer. Nur Spielnummer + Tag
    // reicht NICHT (Spielnummern sind nur je Gruppe eindeutig).
    // Gleiche Mannschaften zählen nur als Kandidat, wenn das Spiel zeitlich
    // nah liegt (verlegt) — Hin-/Rückspiel oder Vorsaison sind keine Verlegung.
    // Freundschaftsspiele/Turniere haben kein verlegbares Ligaspiel — ein
    // Liga-Spiel derselben Paarung Wochen später ist nur das nächste Aufeinandertreffen.
    if (t.pflichtspiel === false) return { terminId: t.id, status: "kein_treffer", spielIds: [] };
    const vage = spiele.filter(
      (s) =>
        (gleicheMannschaften(t, s) && tageAbstand(tag, s.datum) <= MAX_VERLEGUNG_TAGE) ||
        (nummer !== null && s.spielnummer === nummer && gleicheMannschaftenVertauscht(t, s))
    );
    if (vage.length > 0) return { terminId: t.id, status: "unklar", spielIds: vage.map((s) => s.id) };
    return { terminId: t.id, status: "kein_treffer", spielIds: [] };
  });
}

// Eigene Spielhallen: nuLiga-Hallen-IDs (nur für nuLiga-Spiele vergleichbar —
// handball.net nutzt eigene IDs) und/oder Hallennamen (quellenübergreifend,
// Teilstring ohne Groß-/Kleinschreibung und Sonderzeichen).
export function parseHallenNamen(roh: string | null | undefined): string[] {
  return (roh ?? "")
    .split(/[\n,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

export function istEigeneHalle(
  spiel: { halleNuligaId: string | null; halleName: string | null; quelle: string },
  eigene: { ids: string[]; namen: string[] }
): boolean {
  if (spiel.quelle === "nuliga" && spiel.halleNuligaId && eigene.ids.includes(spiel.halleNuligaId)) return true;
  const name = normalisiereName(spiel.halleName);
  if (!name) return false;
  return eigene.namen.some((n) => {
    const gesucht = normalisiereName(n);
    return gesucht !== "" && name.includes(gesucht);
  });
}

const berlinUhrKurz = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// Unterschiede zwischen einem sicher verknüpften Hallenplan-Termin und dem
// öffentlichen Spiel (Trockenlauf der Zusammenführung): weicht die Zeit ab
// (Verlegung, die der Hallenplan noch nicht kennt), und kommt ein Ergebnis aus
// den öffentlichen Daten dazu, das im Termin noch fehlt?
export function vergleicheVerknuepftes(
  termin: { start: Date; ergebnisHeim: number | null; ergebnisAuswaerts: number | null },
  spiel: { datum: string; uhrzeit: string | null; toreHeim: number | null; toreGast: number | null }
): { zeitAbweichung: boolean; ergebnisNeu: boolean } {
  const tagAbweichung = berlinTag.format(termin.start) !== spiel.datum;
  const uhrAbweichung = !!spiel.uhrzeit && berlinUhrKurz.format(termin.start) !== spiel.uhrzeit;
  return {
    zeitAbweichung: tagAbweichung || uhrAbweichung,
    ergebnisNeu:
      (termin.ergebnisHeim === null || termin.ergebnisAuswaerts === null) &&
      spiel.toreHeim !== null &&
      spiel.toreGast !== null,
  };
}
