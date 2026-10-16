// Reine Rechnung für Terminserien (Vereinstermine, ohne DB, getestet in wiederholung.test.ts): aus Beginn, Rhythmus und letztem Tag werden die einzelnen Termine
// berechnet. Gerechnet wird in deutscher Wanduhrzeit, die Uhrzeit bleibt also auch über die Sommer-/Winterzeit-Umstellung gleich.
import { parseBerlinDatumZeit, toDatetimeLocalWert } from "./format";
import { addiereTage, wochentagVonDatum } from "./training-ausfall";

export const WIEDERHOLUNGEN = {
  woechentlich: "Jede Woche",
  zweiwoechentlich: "Alle 2 Wochen",
  monatlich: "Jeden Monat am gleichen Wochentag (z.B. jeden 1. Donnerstag)",
} as const;
export type Wiederholung = keyof typeof WIEDERHOLUNGEN;
export const istWiederholung = (x: string): x is Wiederholung => Object.hasOwn(WIEDERHOLUNGEN, x);

// Mehr als ein Jahr wöchentlich im Voraus anzulegen ist unnötig und würde die Listen fluten.
export const MAX_SERIEN_TERMINE = 52;

const WOCHENTAG_AKKUSATIV = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate(); // monat 1-12
}

const pad = (n: number) => String(n).padStart(2, "0");

// n-ter Wochentag (0 = Montag) eines Monats; gibt es den 5. nicht, gilt der letzte.
export function nteWochentagImMonat(jahr: number, monat: number, wochentag: number, n: number): string {
  const erster = `${jahr}-${pad(monat)}-01`;
  const versatz = (wochentag - wochentagVonDatum(erster) + 7) % 7;
  let tag = 1 + versatz + (n - 1) * 7;
  if (tag > tageImMonat(jahr, monat)) tag -= 7;
  return `${jahr}-${pad(monat)}-${pad(tag)}`;
}

// Lokaler Kalendertag (YYYY-MM-DD) und Uhrzeit (HH:mm) eines Zeitpunkts in deutscher Zeit.
function lokal(d: Date): { datum: string; zeit: string } {
  const w = toDatetimeLocalWert(d);
  return { datum: w.slice(0, 10), zeit: w.slice(11, 16) };
}

// Beginne aller Termine der Serie (der erste ist `start`), höchstens bis einschließlich `bisDatum` (YYYY-MM-DD, deutscher Kalendertag) und höchstens
// MAX_SERIEN_TERMINE. Ein `bisDatum` vor dem Start ergibt nur den ersten Termin.
export function berechneSerie(start: Date, wiederholung: Wiederholung, bisDatum: string): Date[] {
  const { datum: erster, zeit } = lokal(start);
  const tage: string[] = [erster];
  const wochentag = wochentagVonDatum(erster);
  const n = Math.ceil(Number(erster.slice(8, 10)) / 7);
  for (let i = 1; tage.length < MAX_SERIEN_TERMINE; i++) {
    let tag: string;
    if (wiederholung === "monatlich") {
      const gesamt = Number(erster.slice(0, 4)) * 12 + (Number(erster.slice(5, 7)) - 1) + i;
      tag = nteWochentagImMonat(Math.floor(gesamt / 12), (gesamt % 12) + 1, wochentag, n);
    } else {
      tag = addiereTage(erster, i * (wiederholung === "woechentlich" ? 7 : 14));
    }
    if (tag > bisDatum) break;
    tage.push(tag);
  }
  return tage.map((t, i) => (i === 0 ? start : parseBerlinDatumZeit(`${t}T${zeit}`)));
}

// Kurztext für Karten und Mails: "jeden 1. Donnerstag im Monat", "jede Woche am Donnerstag", "alle 2 Wochen am Donnerstag".
export function serienText(wiederholung: Wiederholung, start: Date): string {
  const { datum } = lokal(start);
  const name = WOCHENTAG_AKKUSATIV[wochentagVonDatum(datum)];
  if (wiederholung === "monatlich") {
    const n = Math.ceil(Number(datum.slice(8, 10)) / 7);
    return `jeden ${n}. ${name} im Monat`;
  }
  return wiederholung === "woechentlich" ? `jede Woche am ${name}` : `alle 2 Wochen am ${name}`;
}
