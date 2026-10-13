// Beta-Plätze (reine Rechnung, ohne Datenbank; die Abfrage steht in system-einstellungen.ts holeBetaStand).
// Ist das Kontingent voll, wird das Limit automatisch um einen Platz erhöht, bis höchstens BETA_PLAETZE_MAX. Danach
// registrieren sich Vereine direkt kostenpflichtig (Tarif "regulaer", lib/abrechnung.ts startKonditionen), ohne Warteliste.
export const BETA_PLAETZE_MAX = 10;

export type BetaStand = { limit: number; belegt: number; frei: number; voll: boolean };

// Neues Limit: unverändert, solange ein Platz frei ist oder das Maximum erreicht ist (ein von Hand höher gesetztes Limit wird nie gesenkt),
// sonst ein Platz mehr als belegt (höchstens das Maximum).
export function naechstesBetaLimit(limit: number, belegt: number, max = BETA_PLAETZE_MAX): number {
  if (belegt < limit || limit >= max) return limit;
  return Math.min(max, belegt + 1);
}

export function betaStand(limit: number, belegt: number): BetaStand {
  const frei = Math.max(limit - belegt, 0);
  return { limit, belegt, frei, voll: frei === 0 };
}

// Hinweis auf die knappen Plätze (Outreach-Mail): null, wenn keiner mehr frei ist.
export function betaPlaetzeSatz(frei: number): string | null {
  if (frei <= 0) return null;
  return frei === 1 ? "Es ist nur noch ein Beta-Platz frei." : `Es sind nur noch ${frei} Beta-Plätze frei.`;
}
