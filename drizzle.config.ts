import { defineConfig } from "drizzle-kit";
import "dotenv/config";

// `generate` benötigt keine echte DB-Verbindung, nur `push`/`migrate` tun das.
// Deshalb hier bewusst kein harter Fehler bei fehlenden Env-Variablen.
// Migrationen (CREATE TABLE, CREATE ROLE, RLS-Policies) brauchen die
// privilegierte Rolle (DATABASE_ADMIN_URL) — die eingeschränkte 'app_user'-
// Rolle aus DATABASE_URL reicht dafür nicht aus.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      process.env.DATABASE_URL ??
      "postgres://placeholder/placeholder",
  },
});
