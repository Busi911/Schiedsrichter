-- Zwei-Rollen-Modell für echte RLS-Durchsetzung.
--
-- 'neondb_owner' (Tabellenbesitzer dieser DB) hat auf Neon standardmäßig das
-- Attribut BYPASSRLS — eine Rolle mit BYPASSRLS ignoriert RLS-Policies
-- vollständig, unabhängig von FORCE ROW LEVEL SECURITY (das wirkt nur gegen
-- den impliziten Owner-Bypass, nicht gegen ein explizites BYPASSRLS-Recht).
-- Migrationen liefen bislang mit dieser Rolle, wodurch die RLS-Policies aus
-- 0001 in der Praxis nie geprüft wurden.
--
-- 'app_user' ist eine neue, unprivilegierte Rolle ohne BYPASSRLS für den
-- gesamten regulären App-Traffic (src/db/index.ts). 'neondb_owner' bleibt
-- ausschließlich für Migrationen und den Cron-Job reserviert, der bewusst
-- vereinsübergreifend lesen muss (siehe src/db/admin.ts).
--
-- Das Passwort wird bewusst NICHT hier gesetzt (keine Secrets in
-- versionierten Migrationen) — siehe README für den Rotations-Schritt nach
-- dem Anwenden dieser Migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
