// Erkennt bei der Selbstregistrierung, ob es den Verein vermutlich schon gibt (egal ob aktiv, in Vorbereitung oder inaktiv). Der Abgleich
// ist bewusst unscharf ("HSG Dutenhofen" trifft "HSG Dutenhofen/Münchholzhausen"): ein Treffer sperrt nicht hart, die Person wird gefragt.

// Wörter, die keinen Verein unterscheiden (Rechtsform, Vereinsart, Sportart).
const FUELLWOERTER = new Set([
  "e", "v", "ev", "eingetragener", "verein", "handball", "handballverein", "handballabteilung", "abteilung",
  "hsg", "sg", "jsg", "tv", "tsv", "tsg", "tus", "sv", "spvgg", "vfl", "vfb", "fc", "hv", "hc", "tg", "sc", "ssv", "mtv", "post",
]);

export function normalisiereVereinsname(name: string): string[] {
  return name
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

// Die unterscheidenden Wörter eines Namens (ohne Füllwörter, mindestens 3 Zeichen).
export function kernwoerter(name: string): Set<string> {
  return new Set(normalisiereVereinsname(name).filter((w) => w.length >= 3 && !FUELLWOERTER.has(w)));
}

// Ähnlich = gleiche Kernwörter, oder die Kernwörter des einen Namens stehen vollständig im anderen. Ohne Kernwort (z.B. nur "SG") nie.
export function istAehnlicherName(a: string, b: string): boolean {
  const ka = kernwoerter(a);
  const kb = kernwoerter(b);
  if (ka.size === 0 || kb.size === 0) return false;
  const [klein, gross] = ka.size <= kb.size ? [ka, kb] : [kb, ka];
  return [...klein].every((w) => gross.has(w));
}

export type VereinZustand = "aktiv" | "vorbereitung" | "inaktiv";

export function zustandText(z: VereinZustand): string {
  return z === "aktiv" ? "aktiv" : z === "vorbereitung" ? "in Vorbereitung" : "inaktiv";
}
