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
