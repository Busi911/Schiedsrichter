// Zeitraum der Auswertung (Anzeige UND Excel/PDF-Export, siehe holeTermineFuerAuswertung) in deutscher Zeit.
// Tagesgrenzen über berlinTagesbeginn (exakt auch am Tag der Zeitumstellung). „Von“ gilt ab Beginn des Tages, „Bis“ EINSCHLIESSLICH des ganzen Tages: bis zum Beginn des Folgetags, exklusiv.
// Vorher wurde `new Date("2026-11-14")` (= 14.11. 00:00 UTC) als Obergrenze benutzt, dadurch fielen alle Spiele des
// Bis-Tages heraus (Testbericht 09.11.2026: Von = Bis = 14.11. → „Keine Termine“, obwohl sechs Spiele vorhanden sind).
import { addiereTage, berlinJetzt, berlinTagesbeginn } from "./training-ausfall";

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Gültiger Kalendertag „YYYY-MM-DD“ (sonst wird der Wert ignoriert, statt eine ungültige Abfrage zu erzeugen). */
export function istGueltigerTag(wert: string | undefined | null): wert is string {
  if (!wert || !DATUM.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

export function auswertungsZeitraum(
  von: string | undefined,
  bis: string | undefined,
  jetzt: Date = new Date()
): { vonAb: Date; bisVor: Date | null } {
  // Ohne (gültiges) „von“ gilt der Dienstplan ab heute in deutscher Zeit statt der gesamten Vereinshistorie.
  const vonTag = istGueltigerTag(von) ? von : berlinJetzt(jetzt).datum;
  return {
    vonAb: berlinTagesbeginn(vonTag),
    // „bis“ bleibt ohne Angabe unbegrenzt.
    bisVor: istGueltigerTag(bis) ? berlinTagesbeginn(addiereTage(bis, 1)) : null,
  };
}

export const FEHLER_ENDE_VOR_START = "Das Enddatum muss am oder nach dem Startdatum liegen.";

/** Fehlertext, wenn „Bis“ vor „Von“ liegt (beide gültig); sonst null. Ein leeres Feld ist kein Fehler (unbegrenzt bzw. ab heute). */
export function pruefeZeitraum(von: string | undefined, bis: string | undefined): string | null {
  if (istGueltigerTag(von) && istGueltigerTag(bis) && bis < von) return FEHLER_ENDE_VOR_START;
  return null;
}
