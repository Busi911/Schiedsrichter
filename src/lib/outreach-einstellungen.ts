// Steuerung der automatischen Ansprache neuer Vereine durch den Systemadmin (rein, ohne DB): /system/ansprache.
export const OUTREACH_PRO_LAUF_MIN = 1;
export const OUTREACH_PRO_LAUF_MAX = 20;
export const OUTREACH_PRO_LAUF_STANDARD = 5;

// Ziel erfolgreich angeschriebener Vereine je Lauf (der Cron läuft 2x täglich). Ungültiges fällt auf den Standard, zu
// große/kleine Werte werden begrenzt.
export function begrenzeOutreachProLauf(roh: unknown): number {
  const text = typeof roh === "number" ? String(roh) : String(roh ?? "").trim();
  const n = text === "" ? NaN : Number(text);
  if (!Number.isFinite(n)) return OUTREACH_PRO_LAUF_STANDARD;
  return Math.min(OUTREACH_PRO_LAUF_MAX, Math.max(OUTREACH_PRO_LAUF_MIN, Math.round(n)));
}

// Wie viele Kandidaten ein Lauf höchstens versucht: viele fallen durch (keine E-Mail, keine Mannschaften), deshalb ein
// Vielfaches des Ziels, mindestens 25.
export function maxVersucheFuerZiel(ziel: number): number {
  return Math.max(25, ziel * 5);
}
