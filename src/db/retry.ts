import "server-only";

const TRANSIENTE_PG_CODES = new Set(["57P03", "08006", "08001", "08004"]);

const TRANSIENTE_FEHLER_MUSTER = [
  /connection.*(terminated|closed|reset|refused)/i,
  /timeout/i,
  /fetch failed/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
];

function istTransienterVerbindungsfehler(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  if (code && TRANSIENTE_PG_CODES.has(code)) return true;
  const nachricht = err instanceof Error ? err.message : String(err);
  return TRANSIENTE_FEHLER_MUSTER.some((muster) => muster.test(nachricht));
}

// Neon-Computes fahren nach Inaktivität herunter (Autosuspend) und brauchen
// beim ersten Zugriff ("Cold Start") kurz zum Aufwachen — in diesem Fenster
// kann der allererste Verbindungsversuch mit einem Fehler scheitern, obwohl
// die DB Sekundenbruchteile später normal antwortet (betrifft z.B. den
// Login, da Auth.js bei jedem Request eine DB-Session abfragt). Statt das
// dem Nutzer als Fehler zu zeigen, wird bei einem erkannten transienten
// Verbindungsfehler automatisch mit kurzer Pause erneut versucht.
// Bewusst nur um den Verbindungsaufbau gelegt (siehe Aufrufstellen in
// db/index.ts und db/admin.ts) — NICHT um Queries innerhalb einer bereits
// offenen Transaktion, wo ein blinder Retry nach einem Fehler die
// Transaktion in einen ungültigen Zustand bringen könnte. Cold-Start-Fehler
// treten ohnehin nur beim allerersten Verbindungsversuch auf, nicht mehr
// mitten in einer bereits laufenden Transaktion.
export async function mitColdStartRetry<T>(
  fn: () => Promise<T>,
  versucheUebrig = 2
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (versucheUebrig <= 0 || !istTransienterVerbindungsfehler(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return mitColdStartRetry(fn, versucheUebrig - 1);
  }
}
