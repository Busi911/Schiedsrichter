import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { mitColdStartSchutz } from "./schutz";

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

// Siehe identischer Kommentar in db/index.ts: ohne diesen Listener stürzt
// ein Netzwerkfehler auf einer gerade ungenutzten Pool-Verbindung den
// kompletten Node-Prozess ab (unhandled "error"-Event einer EventEmitter),
// und reißt dabei JEDE gerade laufende Anfrage auf dieser Instanz mit —
// betraf u.a. adminDb-Zugriffe auf der öffentlichen Startseite/Registrierung.
pool.on("error", (err: Error) => {
  console.error("Pool-Fehler auf einer inaktiven DB-Verbindung (adminDb):", err);
});

// Mit Cold-Start-Schutz (siehe schutz.ts): Zugriffe überstehen einen aufwachenden Neon-Compute.
export const adminDb = mitColdStartSchutz(drizzle(pool, { schema }));
