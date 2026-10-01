import type { Geschlecht, LigaInfo, MannschaftsKategorie } from "./types";

// Normalisierung der nuLiga-Bezeichnungen zu einer stabilen Mannschafts-
// Identität. Bewusst regelbasiert über Muster (Kategoriewort, Altersklasse,
// Mannschaftsnummer) statt über feste Teamnamen — jeder Verein benennt
// anders, nuLiga schreibt aber überall "Männer II", "männliche Jugend C II"
// bzw. in Ligatexten "männliche D-Jugend Bezirksklasse - Gr.2".

const ROEMISCH: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

export function nummerZuRoemisch(nummer: number): string {
  return Object.entries(ROEMISCH).find(([, n]) => n === nummer)?.[0] ?? String(nummer);
}

export type NormalisierteMannschaft = {
  kategorie: MannschaftsKategorie;
  geschlecht: Geschlecht | null;
  altersklasse: string | null; // "A".."F"
  untergruppe: string | null; // Kinder: "maxi" | "midi" | "mini"
  nummer: number; // 1 = erste Mannschaft
  schluessel: string; // stabil über Saisons, z.B. "jugend_maennlich:C::2"
  slug: string;
  anzeigename: string;
  entfaellt: boolean;
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Trennt eine Mannschaftsnummer ab: römisch ("Männer II") oder arabisch
// ("Männer/männlich 2") — beides nur als eigenes Wort am Ende, damit
// Spielformen wie "4+1" nicht als Nummer 1 gelesen werden.
function trenneNummer(text: string): { rest: string; nummer: number } {
  const roemisch = text.match(/^(.*\S)\s+(VI|V|IV|III|II|I)$/);
  if (roemisch) return { rest: roemisch[1], nummer: ROEMISCH[roemisch[2]] };
  const arabisch = text.match(/^(.*\S)\s+(\d{1,2})$/);
  if (arabisch) return { rest: arabisch[1], nummer: Number(arabisch[2]) };
  return { rest: text, nummer: 1 };
}

type Klassifikation = Pick<
  NormalisierteMannschaft,
  "kategorie" | "geschlecht" | "altersklasse" | "untergruppe"
>;

// Gemeinsame Erkennung für Mannschaftsnamen UND Liga-Texte.
export function klassifiziere(text: string): Klassifikation | null {
  const t = text.trim();
  if (/\b(männer|herren)\b/i.test(t) && !/jugend/i.test(t)) {
    return { kategorie: "herren", geschlecht: "m", altersklasse: null, untergruppe: null };
  }
  if (/\b(frauen|damen)\b/i.test(t) && !/jugend/i.test(t)) {
    return { kategorie: "damen", geschlecht: "w", altersklasse: null, untergruppe: null };
  }
  // Kinder-/Minispielbetrieb: "Jugend F - Maxi 4+1", "Minis", ...
  const kinder = t.match(/\b(maxi|midi|mini)s?\b/i);
  if (kinder) {
    return {
      kategorie: "kinder",
      geschlecht: "gemischt",
      altersklasse: /\bF\b/.test(t) ? "F" : null,
      untergruppe: kinder[1].toLowerCase(),
    };
  }
  // "männliche Jugend C", "männliche C-Jugend", "weibliche Jugend A", "mJC"
  const jugend = t.match(/\b(männliche|weibliche)\s+(?:jugend\s+)?([A-F])(?:-jugend)?\b/i);
  if (jugend) {
    const maennlich = jugend[1].toLowerCase() === "männliche";
    return {
      kategorie: maennlich ? "jugend_maennlich" : "jugend_weiblich",
      geschlecht: maennlich ? "m" : "w",
      altersklasse: jugend[2].toUpperCase(),
      untergruppe: null,
    };
  }
  const kuerzel = t.match(/\b([mw])J([A-F])\b/);
  if (kuerzel) {
    const maennlich = kuerzel[1] === "m";
    return {
      kategorie: maennlich ? "jugend_maennlich" : "jugend_weiblich",
      geschlecht: maennlich ? "m" : "w",
      altersklasse: kuerzel[2],
      untergruppe: null,
    };
  }
  // Reine "Jugend F"/"F-Jugend" ohne Geschlecht = Kinder/gemischt
  const gemischt = t.match(/\bjugend\s+([E-F])\b|\b([E-F])-jugend\b/i);
  if (gemischt) {
    return {
      kategorie: "kinder",
      geschlecht: "gemischt",
      altersklasse: (gemischt[1] ?? gemischt[2]).toUpperCase(),
      untergruppe: null,
    };
  }
  return null;
}

function bauSlug(k: Klassifikation, nummer: number, fallbackName: string): string {
  let basis: string;
  switch (k.kategorie) {
    case "herren":
      basis = "maenner";
      break;
    case "damen":
      basis = "frauen";
      break;
    case "jugend_maennlich":
      basis = `maennliche-${k.altersklasse!.toLowerCase()}`;
      break;
    case "jugend_weiblich":
      basis = `weibliche-${k.altersklasse!.toLowerCase()}`;
      break;
    case "kinder":
      basis = k.untergruppe
        ? `${(k.altersklasse ?? "f").toLowerCase()}-${k.untergruppe}`
        : `${(k.altersklasse ?? "kinder").toLowerCase()}-jugend`;
      break;
    default:
      basis = slugify(fallbackName) || "mannschaft";
  }
  return nummer > 1 ? `${basis}-${nummer}` : basis;
}

function bauAnzeigename(k: Klassifikation, nummer: number, roh: string): string {
  const suffix = nummer > 1 ? ` ${nummerZuRoemisch(nummer)}` : "";
  switch (k.kategorie) {
    case "herren":
      return `Männer${suffix}`;
    case "damen":
      return `Frauen${suffix}`;
    case "jugend_maennlich":
      return `männliche Jugend ${k.altersklasse}${suffix}`;
    case "jugend_weiblich":
      return `weibliche Jugend ${k.altersklasse}${suffix}`;
    case "kinder": {
      const sub = k.untergruppe
        ? k.untergruppe[0].toUpperCase() + k.untergruppe.slice(1)
        : null;
      return sub ? `${k.altersklasse ? `${k.altersklasse}-Jugend ` : ""}${sub}${suffix}` : `Jugend ${k.altersklasse}${suffix}`;
    }
    default:
      return roh;
  }
}

// Eingabe ist der Text der Spalte "Mannschaft" aus clubTeams. Ist dort
// nichts Erkennbares, hilft der Liga-Text als Rückfall.
export function normalisiereMannschaft(
  rohName: string,
  ligaText?: string | null
): NormalisierteMannschaft {
  const entfaellt = /^entfällt\s*:/i.test(rohName);
  const bereinigt = rohName.replace(/^entfällt\s*:\s*/i, "").trim();
  const { rest, nummer } = trenneNummer(bereinigt);
  const klass = klassifiziere(rest) ?? (ligaText ? klassifiziere(ligaText) : null);

  const k: Klassifikation = klass ?? {
    kategorie: "sonstige",
    geschlecht: null,
    altersklasse: null,
    untergruppe: null,
  };

  return {
    ...k,
    nummer,
    schluessel: [k.kategorie, k.altersklasse ?? "", k.untergruppe ?? "", nummer].join(":"),
    slug: bauSlug(k, nummer, rest),
    anzeigename: bauAnzeigename(k, nummer, bereinigt),
    entfaellt,
  };
}

// Zerlegt den Liga-Text, z.B. "männliche D-Jugend Bezirksklasse - Gr.2",
// "männliche E-Jugend 2.Bezirksklasse Gr.2", "Männer Bezirksoberliga",
// "Meldeliste Maxi 4+1".
export function parseLigaName(name: string): LigaInfo {
  const ohneZusatz = name.replace(/\((?:NEU|neu)\)/g, "").replace(/\s+/g, " ").trim();
  const istMeldeliste = /^meldeliste\b/i.test(ohneZusatz);
  const klass = klassifiziere(ohneZusatz);

  const gruppeTreffer = ohneZusatz.match(/\bGr(?:uppe|\.)?\s*(\d+)\b/i);
  let rest = ohneZusatz;
  if (klass) {
    rest = rest
      .replace(/\b(männliche|weibliche)\s+(?:jugend\s+)?[A-F](?:-jugend)?\b/i, "")
      .replace(/\b(männer|herren|frauen|damen)\b/i, "");
  }
  rest = rest
    .replace(/\s*-?\s*\bGr(?:uppe|\.)?\s*\d+\b/i, "")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: ohneZusatz,
    geschlecht: klass?.geschlecht ?? null,
    altersklasse: klass?.altersklasse ?? null,
    spielklasse: istMeldeliste || !rest ? null : rest,
    gruppe: gruppeTreffer ? `Gr.${gruppeTreffer[1]}` : null,
    istMeldeliste,
  };
}

// "Gießen 26/27" -> "2026/27"
export function saisonAusChampionship(championship: string): string | null {
  const t = championship.match(/(\d{2})\/(\d{2})\s*$/);
  return t ? `20${t[1]}/${t[2]}` : null;
}

// Reguläre Saison = Wettbewerb mit Saison-Suffix, aber ohne
// Freundschaftsspiele ("FS", "FrSp"), Qualifikation oder Turnier-Cups.
export function istRegulaererWettbewerb(championship: string): boolean {
  return (
    saisonAusChampionship(championship) !== null &&
    !/\b(FS|FrSp|Quali|Cup|Turnier)\b/i.test(championship)
  );
}
