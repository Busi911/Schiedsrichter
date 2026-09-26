import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { mitColdStartRetry } from "./retry";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example)");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// KRITISCH: ohne diesen Listener stürzt bei jedem Netzwerkfehler auf einer
// gerade UNGENUTZTEN Pool-Verbindung (z.B. Neon trennt eine idle
// WebSocket-Verbindung serverseitig) der komplette Node-Prozess ab
// ("Unhandled error" von pool.emit("error", …), siehe pg-Dokumentation:
// EventEmitter ohne "error"-Listener wirft/crashed statt nur den Fehler zu
// melden) — betrifft dabei JEDE gerade laufende Anfrage auf dieser
// Prozess-Instanz, nicht nur die, die den Fehler verursacht hat. Ein
// solcher Fehler passiert außerhalb jedes await/try-catch (siehe
// mitColdStartRetry-Kommentar unten, der nur den aktiven Verbindungsaufbau
// abdeckt), daher hier separat abfangen statt nur protokollieren zu
// können.
pool.on("error", (err: Error) => {
  console.error("Pool-Fehler auf einer inaktiven DB-Verbindung (db):", err);
});

// Pool-Client (statt neon-http) ist bewusst gewählt: RLS-Policies stützen sich auf
// current_setting('app.current_verein_id'), das per SET LOCAL innerhalb einer
// Transaktion gesetzt wird (siehe withTenant unten) — das erfordert eine echte
// DB-Session/Transaktion statt zustandsloser HTTP-Einzelrequests.
export const db = drizzle(pool, { schema });

/**
 * Führt callback in einer Transaktion aus, in der app.current_verein_id auf
 * vereinId gesetzt ist. Alle mandantenbezogenen Queries innerhalb von callback
 * MÜSSEN dieselbe (tx-)DB-Instanz verwenden, damit die RLS-Policies greifen.
 * Cold-Start-Retry (siehe mitColdStartRetry) um den kompletten Aufruf, statt
 * tiefer in Pool-Interna einzugreifen (pool.connect/pool.query direkt zu
 * überschreiben ist gegen die echte Neon-Verbindung nicht ausreichend
 * getestet und dafür zu riskant, siehe Commit-Historie).
 */
export async function withTenant<T>(
  vereinId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return mitColdStartRetry(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_verein_id', ${vereinId}, true)`);
      return callback(tx as unknown as typeof db);
    })
  );
}
