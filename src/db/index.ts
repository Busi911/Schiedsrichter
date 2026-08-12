import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { mitColdStartRetry } from "./retry";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example)");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Cold-Start-Retry direkt am Verbindungsaufbau (siehe mitColdStartRetry) —
// greift damit transparent für ALLE Nutzungen von `db` (withTenant unten,
// aber auch den DrizzleAdapter in auth.ts, der `db` beim Login/bei jeder
// Session-Prüfung direkt verwendet).
const urspruenglicheQuery = pool.query.bind(pool);
pool.query = ((...args: unknown[]) =>
  mitColdStartRetry(() =>
    (urspruenglicheQuery as (...a: unknown[]) => Promise<unknown>)(...args)
  )) as unknown as typeof pool.query;

const urspruenglichesConnect = pool.connect.bind(pool);
pool.connect = (() =>
  mitColdStartRetry(() =>
    urspruenglichesConnect()
  )) as unknown as typeof pool.connect;

// Pool-Client (statt neon-http) ist bewusst gewählt: RLS-Policies stützen sich auf
// current_setting('app.current_verein_id'), das per SET LOCAL innerhalb einer
// Transaktion gesetzt wird (siehe withTenant unten) — das erfordert eine echte
// DB-Session/Transaktion statt zustandsloser HTTP-Einzelrequests.
export const db = drizzle(pool, { schema });

/**
 * Führt callback in einer Transaktion aus, in der app.current_verein_id auf
 * vereinId gesetzt ist. Alle mandantenbezogenen Queries innerhalb von callback
 * MÜSSEN dieselbe (tx-)DB-Instanz verwenden, damit die RLS-Policies greifen.
 */
export async function withTenant<T>(
  vereinId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_verein_id', ${vereinId}, true)`);
    return callback(tx as unknown as typeof db);
  });
}
