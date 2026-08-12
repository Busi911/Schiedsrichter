import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

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

export const adminDb = drizzle(pool, { schema });
