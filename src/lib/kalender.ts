// Reine Kalender-Berechnung (kein DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe src/lib/kalender.test.ts.

export type KalenderTag = {
  datum: Date;
  imMonat: boolean;
  heute: boolean;
};

export function tagKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
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
