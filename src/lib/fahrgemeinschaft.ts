// Fahrgemeinschaft für eigene Dienste mit dienst_art.fahrgemeinschaft (z.B. Fahrer): jede eingeteilte Person gibt ihre freien
// Mitfahrplätze (ohne sich selbst) und optional einen Hinweis (Treffpunkt, Abfahrt) an; Dienstwart, Admin oder der Fahrer selbst
// teilen Mitfahrer (nur Namen) zu. Öffentlich (Eintragungsseite) werden nur freie Plätze gezeigt, nie Namen.
// Rein (ohne DB), getestet in fahrgemeinschaft.test.ts; Daten/Actions auf der Dienstwart-Seite und im Profil.

export const MAX_PLAETZE = 8;

// Leere Eingabe = keine Angabe (null).
export function pruefePlaetze(roh: unknown): number | null {
  const text = typeof roh === "string" ? roh.trim() : roh == null ? "" : String(roh);
  if (text === "") return null;
  const zahl = Number(text);
  if (!Number.isInteger(zahl) || zahl < 0 || zahl > MAX_PLAETZE) {
    throw new Error(`Freie Plätze: bitte eine ganze Zahl von 0 bis ${MAX_PLAETZE}.`);
  }
  return zahl;
}

export function pruefeFahrtHinweis(roh: unknown): string | null {
  const text = typeof roh === "string" ? roh.trim().replace(/\s+/g, " ") : "";
  return text ? text.slice(0, 200) : null;
}

export function pruefeMitfahrerName(roh: unknown): string {
  const name = typeof roh === "string" ? roh.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new Error("Bitte einen Namen angeben.");
  if (name.length > 60) throw new Error("Der Name ist zu lang (höchstens 60 Zeichen).");
  return name;
}

export type Fahrt = { plaetze: number | null; mitfahrer: string[] };

// Ein weiterer Mitfahrer passt, solange die angegebenen Plätze nicht belegt sind. Ohne Angabe der Plätze geht es nicht:
// erst muss der Fahrer (oder der Wart) sagen, wie viele mitkönnen.
export function mitfahrerMoeglich(f: Fahrt): boolean {
  return f.plaetze !== null && f.mitfahrer.length < f.plaetze;
}

export function freiePlaetze(f: Fahrt): number {
  return f.plaetze === null ? 0 : Math.max(0, f.plaetze - f.mitfahrer.length);
}

// Zusammenfassung je Termin, z.B. für die öffentliche Eintragung und den Kalender ("5 Mitfahrplätze, 2 frei").
export function fahrtenUebersicht(fahrten: Fahrt[]): { plaetze: number; belegt: number; frei: number; ohneAngabe: number } {
  let plaetze = 0;
  let belegt = 0;
  let ohneAngabe = 0;
  for (const f of fahrten) {
    if (f.plaetze === null) ohneAngabe++;
    else plaetze += f.plaetze;
    belegt += f.mitfahrer.length;
  }
  return { plaetze, belegt, frei: fahrten.reduce((s, f) => s + freiePlaetze(f), 0), ohneAngabe };
}

// Kurztext je Fahrer, z.B. "3 Plätze, 1 frei · Treffpunkt Halle 13:15".
export function fahrtText(f: Fahrt & { hinweis?: string | null }): string {
  const teile = [f.plaetze === null ? "Plätze noch nicht angegeben" : `${f.plaetze} ${f.plaetze === 1 ? "Platz" : "Plätze"}, ${freiePlaetze(f)} frei`];
  if (f.hinweis) teile.push(f.hinweis);
  return teile.join(" · ");
}

// Öffentlicher Text je Termin (ohne Namen), null wenn keine Fahrten mit Plätzen.
export function oeffentlicherFahrtText(fahrten: Fahrt[]): string | null {
  const u = fahrtenUebersicht(fahrten);
  if (u.plaetze === 0) return null;
  return u.frei === 0 ? "Mitfahrplätze: alle belegt" : `Mitfahrplätze frei: ${u.frei}`;
}
