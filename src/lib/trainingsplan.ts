// Reine Zeit-/Überlappungs-Berechnung für den Trainingsplan
// (/admin/trainingsplan, siehe TrainingsplanGrid) — kein DB-Zugriff, daher
// ohne Testdatenbank testbar (siehe trainingsplan.test.ts).

// 0 = Montag … 6 = Sonntag, gleiche Konvention wie monatsGitter in
// lib/kalender.ts.
export const WOCHENTAGE_LABEL = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export const WOCHENTAGE_LABEL_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const RASTER_MINUTEN = 15;

// Vorschau-Farbpalette fürs UI (TrainingsplanGrid) — bewusst als feste Liste
// statt freiem Colorpicker, damit alle Blöcke auf den ersten Blick
// unterscheidbar UND untereinander harmonisch bleiben. In der DB liegt
// trotzdem nur ein freier Hex-String (trainingszeiten.farbe), damit sich die
// Palette später ohne Migration erweitern lässt.
export const TRAININGSFARBEN = [
  "#3b82f6", // blau
  "#ef4444", // rot
  "#22c55e", // grün
  "#f59e0b", // orange
  "#a855f7", // violett
  "#ec4899", // pink
  "#14b8a6", // türkis
  "#78716c", // grau
] as const;

// Deterministische Standardfarbe für eine neu per Drag angelegte
// Trainingszeit — dieselbe Mannschaft bekommt so über mehrere Hallen/Tage
// hinweg by default dieselbe Farbe, bleibt aber pro Trainingszeit-Block
// änderbar (siehe trainingszeitFarbeAendern in trainingsplan/actions.ts).
export function standardFarbeFuerMannschaft(mannschaftId: string): string {
  let hash = 0;
  for (let i = 0; i < mannschaftId.length; i++) {
    hash = (hash * 31 + mannschaftId.charCodeAt(i)) >>> 0;
  }
  return TRAININGSFARBEN[hash % TRAININGSFARBEN.length];
}

// Rundet Minuten seit Mitternacht aufs 15-Minuten-Raster — für Positionen,
// die aus einer Pixel-Koordinate zurückgerechnet wurden (Drag/Resize im
// Grid).
export function rundeAufRaster(minuten: number): number {
  return Math.round(minuten / RASTER_MINUTEN) * RASTER_MINUTEN;
}

export function begrenze(minuten: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, minuten));
}

export function formatUhrzeit(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Optionale Unterteilung einer Halle (z.B. per Hallentrenn-Vorhang) — siehe
// hallen.abteilAnzahl/abteilNName in db/schema.ts. Nur diese Teilmenge der
// Halle-Felder, damit Komponenten nicht die komplette Drizzle-Zeile
// durchreichen müssen, nur um ein Abteil-Label zu berechnen.
export type HalleMitAbteilen = {
  abteilAnzahl: number;
  abteil1Name: string | null;
  abteil2Name: string | null;
  abteil3Name: string | null;
  abteil4Name: string | null;
};

// 0 = keine Unterteilung — dazwischenliegende Werte (1) sind sinnlos (eine
// Halle "in 1 Teil" zu unterteilen entspricht keiner Unterteilung), daher
// hier bewusst nicht Teil der UI-Auswahl (siehe HalleBearbeitenDialog).
export const ABTEIL_ANZAHL_OPTIONEN = [0, 2, 3, 4] as const;

// Anzeigename eines Abteils: der vom Verein vergebene Name, sonst Fallback
// "Abteil N" — damit ein Abteil auch ohne eigenen Namen sofort benutzbar
// ist (siehe "ggf. benennen"-Wunsch, Namensvergabe ist rein optional).
export function abteilLabel(halle: HalleMitAbteilen, nummer: number): string {
  const name = [
    halle.abteil1Name,
    halle.abteil2Name,
    halle.abteil3Name,
    halle.abteil4Name,
  ][nummer - 1];
  return name ?? `Abteil ${nummer}`;
}

export type ZeitBlock = {
  id: string;
  startMinuten: number;
  endMinuten: number;
};

export type PlatzierterZeitBlock<T> = T & {
  // 0-basiert; bei Überschneidung mehrerer Blöcke am selben Tag/derselben
  // Halle nebeneinander statt übereinander (siehe unten).
  lane: number;
  // Anzahl gleichzeitig aktiver Lanes in der Überschneidungsgruppe dieses
  // Blocks — die UI teilt die verfügbare Breite entsprechend auf
  // (100% / lanesGesamt).
  lanesGesamt: number;
};

// Platziert überlappende Trainingszeiten (bereits auf denselben Wochentag
// UND dieselbe Halle gefiltert) nebeneinander statt sie zu verdecken —
// Hallen lassen sich teilen (z.B. per Vorhang), gleichzeitige Belegungen
// derselben Halle sind hier also gewollt, kein Konflikt. Greedy-
// Intervallfärbung analog zu platziereBalken in lib/kalender.ts, hier aber
// als reine Minuten-Intervalle an einem einzelnen Tag statt über
// Kalenderwochen hinweg, und mit lanesGesamt PRO Überschneidungsgruppe
// (zusammenhängende Kette sich überlappender Blöcke), damit eine spätere,
// isolierte Überschneidung nicht unnötig die Breite aller anderen Blöcke
// mitbestimmt.
export function platziereZeitbloecke<T extends ZeitBlock>(
  bloecke: T[]
): PlatzierterZeitBlock<T>[] {
  const sortiert = [...bloecke].sort((a, b) => a.startMinuten - b.startMinuten);

  const ergebnis: PlatzierterZeitBlock<T>[] = [];
  let gruppe: (T & { lane: number })[] = [];
  let gruppenEnde = -Infinity;
  const laneEnden: number[] = []; // laneEnden[lane] = Ende des letzten Blocks dieser Lane

  function gruppeAbschliessen() {
    if (gruppe.length === 0) return;
    const lanesGesamt = Math.max(...gruppe.map((b) => b.lane)) + 1;
    for (const b of gruppe) {
      ergebnis.push({ ...b, lanesGesamt });
    }
    gruppe = [];
    laneEnden.length = 0;
  }

  for (const block of sortiert) {
    if (block.startMinuten >= gruppenEnde) {
      // Keine Überschneidung mit der bisherigen Gruppe (Lücke) — neue
      // Überschneidungsgruppe beginnen.
      gruppeAbschliessen();
      gruppenEnde = -Infinity;
    }

    let lane = laneEnden.findIndex((ende) => ende <= block.startMinuten);
    if (lane === -1) {
      lane = laneEnden.length;
      laneEnden.push(0);
    }
    laneEnden[lane] = block.endMinuten;
    gruppenEnde = Math.max(gruppenEnde, block.endMinuten);
    gruppe.push({ ...block, lane });
  }
  gruppeAbschliessen();

  return ergebnis;
}
