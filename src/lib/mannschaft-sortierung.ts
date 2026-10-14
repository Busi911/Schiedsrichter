// Sortiert Mannschaften nach Spielklasse statt alphabetisch nach Namen — in der Vereinspraxis erwartet: Männer, Frauen, Jugend A bis E
// (je Altersklasse männlich vor weiblich), dann Mini/Maxi, unbekannte Namen alphabetisch ans Ende. Erkannt wird aus dem Namen UND der
// Altersklasse: automatisch angelegte Mannschaften heißen oft alle gleich (z.B. "HSG Dutenh./Münchholzh."), die Klasse steht dann nur in
// `altersklasse` (nuLiga-Kürzel "MJC", "WJD", "M", "F", Hallenplan-Format "mJC", "Mä/männl.", Demo "mA").
const UNBEKANNT = 100;

type Klasse = { rang: number; geschlecht: number };

function klasseAusText(text: string): Klasse | null {
  const t = text.trim();
  if (!t) return null;
  // Jugend: Kürzel "MJC"/"wJD"/"mA"/"wC" oder ausgeschrieben "männliche A-Jugend", "C-Jugend"
  const kuerzel = t.match(/^([mw])j?([a-e])$/i);
  if (kuerzel) return { rang: 2 + "abcde".indexOf(kuerzel[2].toLowerCase()), geschlecht: kuerzel[1].toLowerCase() === "m" ? 0 : 1 };
  const jugend = t.match(/\b([a-e])[-\s]?jugend\b/i);
  if (jugend) {
    const geschlecht = /\b(weiblich|weibl)/i.test(t) ? 1 : 0;
    return { rang: 2 + "abcde".indexOf(jugend[1].toLowerCase()), geschlecht };
  }
  if (/\bminis?\b/i.test(t)) return { rang: 7, geschlecht: 0 };
  if (/\bmaxis?\b/i.test(t)) return { rang: 8, geschlecht: 0 };
  if (/^(m|mä|mä\/männl\.?)$/i.test(t) || /\b(herren|männer)\b/i.test(t)) return { rang: 0, geschlecht: 0 };
  if (/^(f|fr|fr\/weibl\.?)$/i.test(t) || /\b(damen|frauen)\b/i.test(t)) return { rang: 1, geschlecht: 1 };
  return null;
}

function klasse(m: { name: string; altersklasse?: string | null }): Klasse {
  return klasseAusText(m.name) ?? klasseAusText(m.altersklasse ?? "") ?? { rang: UNBEKANNT, geschlecht: 0 };
}

// Mannschaftsnummer aus dem Namen ("Herren 2" -> 2, "HSG ... II" -> 2), damit 1 und 2 derselben Klasse untereinander stehen.
const ROEMISCH: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
function teamNummer(name: string): number {
  const roemisch = name.match(/\b(I{1,3}|IV|V)\b/);
  if (roemisch) return ROEMISCH[roemisch[1]];
  const zahl = name.match(/\d+/);
  return zahl ? Number(zahl[0]) : 1;
}

export function vergleicheMannschaften<T extends { name: string; altersklasse?: string | null }>(a: T, b: T): number {
  const ka = klasse(a);
  const kb = klasse(b);
  if (ka.rang !== kb.rang) return ka.rang - kb.rang;
  if (ka.geschlecht !== kb.geschlecht) return ka.geschlecht - kb.geschlecht;
  const nummerDiff = teamNummer(a.name) - teamNummer(b.name);
  if (nummerDiff !== 0) return nummerDiff;
  return a.name.localeCompare(b.name, "de-DE");
}

export function sortiereMannschaften<T extends { name: string; altersklasse?: string | null }>(liste: T[]): T[] {
  return [...liste].sort(vergleicheMannschaften);
}
