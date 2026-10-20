import { saisonLabel, saisonSortKey } from "./saison";

// Rein (ohne DB, getestet): Dienste je Funktionsträger, getrennt nach Rolle und nach
// "geleistet" (Termin vorbei) und "eingetragen" (Termin liegt noch vor uns).

export const DIENST_ROLLEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "ordner",
  "kioskdienst",
  "kassierer",
  "eigener_dienst",
] as const;
export type DienstRolle = (typeof DIENST_ROLLEN)[number];

export const DIENST_ROLLE_LABEL: Record<DienstRolle, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  eigener_dienst: "Eigene Dienste",
};

export type DienstZeile = { userId: string; typ: string; start: Date };
export type PersonRef = { userId: string; name: string | null; email: string };

export type FunktionstraegerDienste = PersonRef & {
  geleistet: number;
  eingetragen: number;
  nachRolle: Partial<Record<DienstRolle, { geleistet: number; eingetragen: number }>>;
};

export function istDienstRolle(typ: string): typ is DienstRolle {
  return (DIENST_ROLLEN as readonly string[]).includes(typ);
}

export function saisonsAusZeilen(zeilen: DienstZeile[], jetzt: Date): string[] {
  const set = new Set(zeilen.map((z) => saisonLabel(z.start)));
  set.add(saisonLabel(jetzt));
  return [...set].sort((a, b) => saisonSortKey(b) - saisonSortKey(a));
}

// saison = Label wie "2026/27" oder null für alle Saisons. Personen ohne Dienst bleiben in der
// Liste (0/0), damit man sieht, wer noch gar nicht eingeteilt war. Sortierung: geleistet, dann eingetragen, dann Name.
export function fasseDiensteZusammen(
  personen: PersonRef[],
  zeilen: DienstZeile[],
  saison: string | null,
  jetzt: Date
): FunktionstraegerDienste[] {
  const map = new Map<string, FunktionstraegerDienste>();
  for (const p of personen) {
    map.set(p.userId, { ...p, geleistet: 0, eingetragen: 0, nachRolle: {} });
  }
  for (const z of zeilen) {
    if (!istDienstRolle(z.typ)) continue;
    if (saison && saisonLabel(z.start) !== saison) continue;
    const eintrag = map.get(z.userId);
    if (!eintrag) continue;
    const feld = z.start.getTime() < jetzt.getTime() ? "geleistet" : "eingetragen";
    eintrag[feld] += 1;
    const r = (eintrag.nachRolle[z.typ] ??= { geleistet: 0, eingetragen: 0 });
    r[feld] += 1;
  }
  return [...map.values()].sort(
    (a, b) =>
      b.geleistet - a.geleistet ||
      b.eingetragen - a.eingetragen ||
      (a.name ?? a.email).localeCompare(b.name ?? b.email, "de")
  );
}
