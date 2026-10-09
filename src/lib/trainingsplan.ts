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
// Bewusst auf ähnliche Sättigung/Helligkeit abgestimmt (statt Tailwinds
// Standardfarben unverändert zu übernehmen) — wirkt als ein zusammen
// designtes Farbschema statt als zufällig gemischte Regenbogenpalette.
export const TRAININGSFARBEN = [
  "#4C6EF5", // indigo
  "#38A3C9", // sky
  "#2F9E86", // teal
  "#3FAE7A", // grün
  "#77AE3C", // oliv
  "#E2A03D", // amber
  "#E2645F", // koralle
  "#9B7BEA", // violett
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

// ---------------------------------------------------------------------------
// Abteile, Konflikte, Teilen und Tauschen
// ---------------------------------------------------------------------------

// Spur eines Abteils im Tagesstreifen einer unterteilten Halle: Abteil n von N belegt das n-te Stück der Breite (links/Breite in Anteilen 0-1).
// Ein Training OHNE Abteil in einer unterteilten Halle gilt als "ganze Halle" und nimmt die volle Breite.
export function abteilSpur(abteilAnzahl: number, abteilNummer: number | null): { links: number; breite: number } {
  if (abteilAnzahl <= 0 || abteilNummer == null || abteilNummer < 1 || abteilNummer > abteilAnzahl) return { links: 0, breite: 1 };
  return { links: (abteilNummer - 1) / abteilAnzahl, breite: 1 / abteilAnzahl };
}

// Welches Abteil liegt unter einer waagerechten Position (Anteil 0-1 der Tagesspalte)? Bei einer nicht unterteilten Halle: null.
export function abteilAusPosition(abteilAnzahl: number, anteil: number): number | null {
  if (abteilAnzahl <= 0) return null;
  const n = Math.floor(Math.min(0.999999, Math.max(0, anteil)) * abteilAnzahl) + 1;
  return n;
}

export type BelegungsEintrag = {
  id: string;
  mannschaftId: string;
  halleId: string;
  wochentag: number;
  startMinuten: number;
  endMinuten: number;
  abteilNummer: number | null;
};

// "doppelt": dieselbe Mannschaft zur selben Zeit zweimal (egal wo). "abteil": zwei Mannschaften im selben Abteil derselben Halle.
// "ohne_abteil": in einer unterteilten Halle hat mindestens eine der beiden Belegungen kein Abteil (belegt ggf. die ganze Halle) — nur ein
// Hinweis. In einer NICHT unterteilten Halle sind gleichzeitige Trainings weiter erlaubt (z.B. Vorhang, ohne dass der Verein Abteile pflegt).
export type KonfliktArt = "doppelt" | "abteil" | "ohne_abteil";

export type Konflikt = {
  art: KonfliktArt;
  a: string;
  b: string;
  wochentag: number;
  von: number;
  bis: number;
  halleId: string;
  abteilNummer: number | null;
};

export function findeKonflikte(eintraege: BelegungsEintrag[], abteilAnzahlJeHalle: Map<string, number>): Konflikt[] {
  const konflikte: Konflikt[] = [];
  for (let i = 0; i < eintraege.length; i++) {
    for (let j = i + 1; j < eintraege.length; j++) {
      const a = eintraege[i];
      const b = eintraege[j];
      if (a.wochentag !== b.wochentag) continue;
      const von = Math.max(a.startMinuten, b.startMinuten);
      const bis = Math.min(a.endMinuten, b.endMinuten);
      if (von >= bis) continue; // keine Überschneidung (direkt aneinander ist kein Konflikt)

      let art: KonfliktArt | null = null;
      let abteil: number | null = null;
      if (a.mannschaftId === b.mannschaftId) {
        art = "doppelt";
      } else if (a.halleId === b.halleId && (abteilAnzahlJeHalle.get(a.halleId) ?? 0) > 0) {
        if (a.abteilNummer != null && a.abteilNummer === b.abteilNummer) {
          art = "abteil";
          abteil = a.abteilNummer;
        } else if (a.abteilNummer == null || b.abteilNummer == null) {
          art = "ohne_abteil";
        }
      }
      if (art) konflikte.push({ art, a: a.id, b: b.id, wochentag: a.wochentag, von, bis, halleId: a.halleId, abteilNummer: abteil });
    }
  }
  return konflikte;
}

// Aufteilen einer Trainingszeit in zwei Abschnitte (Wechsel, z.B. erste halbe Stunde Abteil Nord, zweite Abteil Süd): der Wechselzeitpunkt muss
// aufs Raster passen und beide Teile mindestens einen Rasterschritt lang lassen. Gibt eine Fehlermeldung oder null zurück.
export function pruefeTeilung(start: number, ende: number, teil: number): string | null {
  if (!Number.isInteger(teil) || teil % RASTER_MINUTEN !== 0) return "Der Wechsel muss auf eine Viertelstunde fallen.";
  if (teil <= start || teil >= ende) return "Der Wechsel muss innerhalb des Trainings liegen.";
  return null;
}
