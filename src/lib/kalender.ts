// Reine Kalender-Berechnung (kein DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe src/lib/kalender.test.ts.
import { ZEITZONE } from "./format";

export type KalenderTag = {
  datum: Date;
  imMonat: boolean;
  heute: boolean;
};

// Ordnet einen Zeitpunkt seinem Kalendertag in Europe/Berlin zu — nicht der
// Zeitzone der Laufzeitumgebung. tagKey wird sowohl serverseitig (echte
// Termin-Zeitstempel aus der DB, z.B. admin/kalender) als auch clientseitig
// (synthetische Tages-Zellen im Kalendergitter) aufgerufen; ohne feste
// Zeitzone würden Termine kurz nach Mitternacht Berliner Zeit auf einem
// UTC-Server (Vercel) noch dem Vortag zugeordnet und tauchten in der
// Tagesansicht am falschen Tag auf.
export function tagKey(d: Date): string {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZEITZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const teil = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  return `${teil("year")}-${teil("month")}-${teil("day")}`;
}

// Gruppiert bereits nach Startzeit sortierte Einträge nach Kalendertag
// (Europe/Berlin) — z.B. für mehrtägige Turnier-Spielpläne, deren Spiele pro
// Tag mit einer Wochentag/Datum-Überschrift übersichtlicher sind als eine
// einzige lange Liste. Reihenfolge der Gruppen ergibt sich automatisch aus
// der Reihenfolge der Einträge (Map behält Einfügereihenfolge bei).
export function gruppiereProTag<T extends { start: Date }>(
  items: T[]
): { tag: string; items: T[] }[] {
  const gruppen = new Map<string, T[]>();
  for (const item of items) {
    const key = tagKey(item.start);
    const liste = gruppen.get(key) ?? [];
    liste.push(item);
    gruppen.set(key, liste);
  }
  return [...gruppen.entries()].map(([tag, items]) => ({ tag, items }));
}

export type TurnierBalken = {
  id: string;
  label: string;
  href?: string;
  // tagKey-Format (YYYY-MM-DD, Europe/Berlin) — Grenzen inklusiv.
  startTag: string;
  endTag: string;
};

export type PlatzierterBalken = TurnierBalken & {
  startSpalte: number; // 1-7 (Montag=1) — CSS-Grid-Spalte innerhalb der Woche
  spannweite: number; // Anzahl Spalten in dieser Woche
  lane: number; // 0-basiert; bei Überschneidung mehrerer Balken in derselben Woche
};

// Platziert mehrtägige Balken (z.B. Turniere) pro Kalenderwoche als
// CSS-Grid-Spalten + Lane (Zeile bei Überschneidung) — Greedy-
// Intervallfärbung, sortiert nach Dauer (lang zuerst) für ein ruhigeres
// Bild. Reicht für die in der Praxis seltenen gleichzeitig laufenden
// Turniere; ein Balken, der über mehrere Wochen läuft, wird pro Woche
// separat (mit an die Woche geklammerten Start-/Endspalten) platziert,
// damit er über die Wochenzeilen hinweg durchgehend wirkt.
export function platziereBalken(
  wochen: KalenderTag[][],
  balken: TurnierBalken[]
): PlatzierterBalken[][] {
  return wochen.map((woche) => {
    const wocheKeys = woche.map((t) => tagKey(t.datum));

    const ueberlappend = balken
      .map((b) => {
        const startIdx = wocheKeys.findIndex((k) => k >= b.startTag);
        let endIdx = -1;
        for (let i = wocheKeys.length - 1; i >= 0; i--) {
          if (wocheKeys[i] <= b.endTag) {
            endIdx = i;
            break;
          }
        }
        if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
        return {
          ...b,
          startSpalte: startIdx + 1,
          spannweite: endIdx - startIdx + 1,
        };
      })
      .filter((b): b is TurnierBalken & { startSpalte: number; spannweite: number } => b !== null)
      .sort((a, b) => b.spannweite - a.spannweite || a.startSpalte - b.startSpalte);

    const laneEnden: number[] = []; // laneEnden[lane] = letzte belegte Spalte dieser Lane
    const platziert: PlatzierterBalken[] = [];
    for (const b of ueberlappend) {
      let lane = laneEnden.findIndex((ende) => ende < b.startSpalte);
      if (lane === -1) {
        lane = laneEnden.length;
        laneEnden.push(0);
      }
      laneEnden[lane] = b.startSpalte + b.spannweite - 1;
      platziert.push({ ...b, lane });
    }
    return platziert;
  });
}

export function monatKey(jahr: number, monatNull: number): string {
  return `${jahr}-${String(monatNull + 1).padStart(2, "0")}`;
}

export function parseMonatParam(
  wert: string | undefined,
  jetzt: Date = new Date()
): { jahr: number; monatNull: number } {
  if (wert) {
    const match = /^(\d{4})-(\d{2})$/.exec(wert);
    if (match) {
      const jahr = Number(match[1]);
      const monatNull = Number(match[2]) - 1;
      if (monatNull >= 0 && monatNull <= 11) return { jahr, monatNull };
    }
  }
  return { jahr: jetzt.getFullYear(), monatNull: jetzt.getMonth() };
}

// Bereich [von, bis] des Kalendermonats (für DB-Abfragen).
export function monatsBereich(
  jahr: number,
  monatNull: number
): { von: Date; bis: Date } {
  const von = new Date(jahr, monatNull, 1, 0, 0, 0, 0);
  const bis = new Date(jahr, monatNull + 1, 0, 23, 59, 59, 999);
  return { von, bis };
}

// Wochen-Raster (Montag als Wochenstart), inkl. Auffüll-Tage aus dem
// Vor-/Folgemonat, damit die Wochen immer vollständig sind. Überschüssige
// Wochen am Ende, die komplett außerhalb des Monats liegen, werden entfernt.
export function monatsGitter(
  jahr: number,
  monatNull: number,
  heute: Date = new Date()
): KalenderTag[][] {
  const ersterDesMonats = new Date(jahr, monatNull, 1);
  const wochentagErster = (ersterDesMonats.getDay() + 6) % 7; // 0 = Montag
  const heuteKey = tagKey(heute);

  const cursor = new Date(jahr, monatNull, 1 - wochentagErster);
  const wochen: KalenderTag[][] = [];
  for (let woche = 0; woche < 6; woche++) {
    const tage: KalenderTag[] = [];
    for (let tag = 0; tag < 7; tag++) {
      tage.push({
        datum: new Date(cursor),
        imMonat: cursor.getMonth() === monatNull,
        heute: tagKey(cursor) === heuteKey,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    wochen.push(tage);
  }

  while (wochen.length > 1 && wochen[wochen.length - 1].every((t) => !t.imMonat)) {
    wochen.pop();
  }

  return wochen;
}
