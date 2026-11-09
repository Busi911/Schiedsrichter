// Filter für „Spiele & Turniere → Hallenspielplan“ (rein/getestet). Die Liste zeigt neben Spielen an den eigenen Hallen auch Spiele der eigenen
// Mannschaften in fremden Hallen (Auswärtsspiele); die Erklärung dort und die Suche allein reichten nicht, beides zu trennen (Testbericht 09.11.2026).
import { istEigeneHalle, parseHallenNamen } from "./hallenplan-abgleich";

export type Ansicht = "alle" | "eigene" | "auswaerts";

/** true = Spiel in einer eigenen Spielhalle, false = in einer fremden Halle (Auswärtsspiel), null = nicht entscheidbar (keine Hallen eingetragen / kein Ort). */
export function inEigenerHalle(ort: string | null, eigeneHallenNamen: string | null | undefined): boolean | null {
  const namen = parseHallenNamen(eigeneHallenNamen);
  if (namen.length === 0 || !ort?.trim()) return null;
  return istEigeneHalle({ halleNuligaId: null, halleName: ort, quelle: "namen" }, { ids: [], namen });
}

export type FilterEingabe = { ansicht: Ansicht; mannschaft: string; halle: string };

export function filtereNachAnsicht<T extends { eigeneHalle: boolean | null; mannschaftName: string | null; ort: string | null }>(
  liste: T[],
  f: FilterEingabe
): T[] {
  return liste.filter((t) => {
    if (f.ansicht === "eigene" && t.eigeneHalle !== true) return false;
    if (f.ansicht === "auswaerts" && t.eigeneHalle !== false) return false;
    if (f.mannschaft && (t.mannschaftName ?? "") !== f.mannschaft) return false;
    if (f.halle && (t.ort ?? "") !== f.halle) return false;
    return true;
  });
}

/** Eindeutige, sortierte Werte für die Auswahlfelder (Mannschaft, Halle). */
export function eindeutigeWerte(werte: (string | null | undefined)[]): string[] {
  return [...new Set(werte.map((w) => (w ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}
