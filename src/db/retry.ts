import "server-only";

const TRANSIENTE_PG_CODES = new Set(["57P03", "08006", "08001", "08004"]);

const TRANSIENTE_FEHLER_MUSTER = [
  /connection.*(terminated|closed|reset|refused)/i,
  /timeout/i,
  /fetch failed/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
];

// Nur Fehler, bei denen die Anweisung SICHER noch nicht ausgeführt wurde (Verbindungsaufbau schlug fehl):
// für Schreibzugriffe, damit ein Wiederholen nie etwas doppelt anlegt. "terminated"/"reset"/"timeout"
// können dagegen auch mitten in einer Anweisung auftreten.
const SICHERE_FEHLER_MUSTER = [
  /connection timeout/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /could not connect|cannot connect/i,
];

function istTransienterVerbindungsfehler(err: unknown, strikt = false): boolean {
  // drizzle verpackt Datenbankfehler in einen "Failed query: …"-Fehler und hängt den eigentlichen Fehler
  // (mit Code/Meldung der Verbindung) als `cause` an — deshalb die ganze Kette prüfen, sonst erkennt man
  // einen Cold-Start-Fehler nie.
  for (let fehler: unknown = err, tiefe = 0; fehler && tiefe < 5; tiefe++) {
    if (istTransient(fehler, strikt)) return true;
    fehler = (fehler as { cause?: unknown }).cause;
  }
  return false;
}

function istTransient(err: unknown, strikt: boolean): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  if (code && TRANSIENTE_PG_CODES.has(code)) {
    // 08006 (connection_failure) kann mitten in einer Anweisung auftreten.
    return !strikt || code !== "08006";
  }
  const nachricht = err instanceof Error ? err.message : String(err);
  return (strikt ? SICHERE_FEHLER_MUSTER : TRANSIENTE_FEHLER_MUSTER).some((muster) => muster.test(nachricht));
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
  versucheUebrig = 2,
  strikt = false
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (versucheUebrig <= 0 || !istTransienterVerbindungsfehler(err, strikt)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return mitColdStartRetry(fn, versucheUebrig - 1, strikt);
  }
}
