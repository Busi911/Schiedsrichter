// Zeitliche Überschneidung von Einteilungen: dieselbe Person kann nicht zur selben Zeit
// an zwei Terminen eingeteilt sein (rollenübergreifend). Rein, ohne Datenbank.

/** Angenommene Dauer eines Termins ohne Ende (Minuten). */
export const STANDARD_DAUER_MINUTEN = 90;
/** Turnierspiele ohne Ende folgen dicht aufeinander: dort zählt nur derselbe Beginn. */
export const TURNIER_DAUER_MINUTEN = 1;

export type ZeitTermin = { start: Date; ende: Date | null; typ?: string };

export function terminEnde(t: ZeitTermin): Date {
  if (t.ende && t.ende.getTime() > t.start.getTime()) return t.ende;
  const minuten = t.typ === "turnier_spiel" ? TURNIER_DAUER_MINUTEN : STANDARD_DAUER_MINUTEN;
  return new Date(t.start.getTime() + minuten * 60_000);
}

/** Überschneiden sich zwei Termine? Direktes Anschließen (Ende = Beginn) zählt nicht. */
export function ueberschneiden(a: ZeitTermin, b: ZeitTermin): boolean {
  return a.start.getTime() < terminEnde(b).getTime() && b.start.getTime() < terminEnde(a).getTime();
}

export function findeUeberschneidungen<T extends ZeitTermin>(neu: ZeitTermin, bestehende: T[]): T[] {
  return bestehende.filter((b) => ueberschneiden(neu, b));
}
