import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { mitColdStartRetry } from "./retry";

if (!process.env.DATABASE_ADMIN_URL) {
  throw new Error(
    "DATABASE_ADMIN_URL ist nicht gesetzt (siehe .env.example)"
  );
}

// Privilegierte Verbindung (BYPASSRLS) — NUR für System-/Cron-Jobs nutzen,
// die bewusst vereinsübergreifend lesen müssen (z.B. "alle Schiedsrichter
// mit ICS-Feed-URL, egal welcher Verein"). Für alles andere src/db/index.ts
// (withTenant) verwenden, sonst ist die Mandantentrennung wirkungslos.
const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });

// Cold-Start-Retry am Verbindungsaufbau, siehe gleichnamige Stelle in
// src/db/index.ts.
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

export const adminDb = drizzle(pool, { schema });
