// Filter für „Spiele & Turniere → Hallenspielplan“ (rein/getestet). Die Liste zeigt neben Spielen an den eigenen Hallen auch Spiele der eigenen
// Mannschaften in fremden Hallen (Auswärtsspiele); die Erklärung dort und die Suche allein reichten nicht, beides zu trennen (Testbericht 09.11.2026).
import { istEigeneHalle, normalisiereHalle, parseHallenNamen } from "./hallenplan-abgleich";

export type Ansicht = "alle" | "eigene" | "auswaerts";

/** true = Spiel in einer eigenen Spielhalle, false = in einer fremden Halle (Auswärtsspiel), null = nicht entscheidbar (keine Hallen eingetragen / kein Ort). */
export function inEigenerHalle(ort: string | null, eigeneHallenNamen: string | null | undefined): boolean | null {
  const namen = parseHallenNamen(eigeneHallenNamen);
  if (namen.length === 0 || !ort?.trim()) return null;
  return istEigeneHalle({ halleNuligaId: null, halleName: ort, quelle: "namen" }, { ids: [], namen });
}

/** Stabile Hallenidentität: Schreibvarianten („Sporthalle Dutenhofen“, „SPORTHALLE DUTENHOFEN“, mit/ohne Sonderzeichen) ergeben denselben Schlüssel. */
export function hallenSchluessel(ort: string | null | undefined): string {
  return normalisiereHalle(ort?.trim() || null);
}

export type FilterEingabe = {
  ansicht: Ansicht;
  /** Stabile Mannschafts-ID (nicht der Anzeigename: mehrere Mannschaften heißen oft gleich). Leer = alle. */
  mannschaftId: string;
  /** Hallenschlüssel (siehe `hallenSchluessel`). Leer = alle. */
  halle: string;
};

export function filtereNachAnsicht<T extends { eigeneHalle: boolean | null; mannschaftId: string | null; ort: string | null }>(
  liste: T[],
  f: FilterEingabe
): T[] {
  return liste.filter((t) => {
    if (f.ansicht === "eigene" && t.eigeneHalle !== true) return false;
    if (f.ansicht === "auswaerts" && t.eigeneHalle !== false) return false;
    if (f.mannschaftId && t.mannschaftId !== f.mannschaftId) return false;
    if (f.halle && hallenSchluessel(t.ort) !== f.halle) return false;
    return true;
  });
}

/**
 * Auswahl für den Hallenfilter: je Hallenidentität EIN Eintrag. Als Bezeichnung dient die schönste vorkommende Schreibweise
 * (gemischte Groß-/Kleinschreibung vor reinen Großbuchstaben, dann die häufigste, dann die erste).
 */
export function hallenOptionen(orte: (string | null | undefined)[]): { schluessel: string; label: string }[] {
  const gruppen = new Map<string, Map<string, number>>();
  for (const ort of orte) {
    const name = ort?.trim();
    if (!name) continue;
    const schluessel = hallenSchluessel(name);
    if (!schluessel) continue;
    const varianten = gruppen.get(schluessel) ?? new Map<string, number>();
    varianten.set(name, (varianten.get(name) ?? 0) + 1);
    gruppen.set(schluessel, varianten);
  }
  const nurGross = (n: string) => n === n.toLocaleUpperCase("de-DE") && n !== n.toLocaleLowerCase("de-DE");
  return [...gruppen.entries()]
    .map(([schluessel, varianten]) => {
      const beste = [...varianten.entries()].sort((a, b) => Number(nurGross(a[0])) - Number(nurGross(b[0])) || b[1] - a[1])[0][0];
      return { schluessel, label: beste };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

/** Auswahl für den Mannschaftsfilter: je stabiler ID ein Eintrag mit verständlicher Bezeichnung (Name, Altersklasse); gleiche Bezeichnungen werden durchnummeriert, damit sie unterscheidbar bleiben. */
export function mannschaftsOptionen(
  mannschaften: { id: string; label: string }[]
): { id: string; label: string }[] {
  const eindeutig = new Map(mannschaften.map((m) => [m.id, m]));
  const liste = [...eindeutig.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
  const anzahl = new Map<string, number>();
  for (const m of liste) anzahl.set(m.label, (anzahl.get(m.label) ?? 0) + 1);
  const laufend = new Map<string, number>();
  return liste.map((m) => {
    if ((anzahl.get(m.label) ?? 0) < 2) return m;
    const n = (laufend.get(m.label) ?? 0) + 1;
    laufend.set(m.label, n);
    return { id: m.id, label: `${m.label} (${n})` };
  });
}
