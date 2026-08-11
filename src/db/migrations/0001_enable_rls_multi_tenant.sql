-- Row-Level-Security für Mandantentrennung (mehrere Vereine in einer DB).
--
-- Jede Anfrage muss innerhalb einer Transaktion laufen, die zuvor
--   select set_config('app.current_verein_id', '<verein-uuid>', true)
-- ausgeführt hat (siehe src/db/index.ts -> withTenant()). Ohne gesetzten Wert
-- liefert current_setting(...) NULL, wodurch die Policies keine Zeile matchen
-- ("fail closed" statt versehentlich alles freizugeben).
--
-- FORCE ROW LEVEL SECURITY sorgt dafür, dass die Policies auch für den
-- Tabellenbesitzer (die App-DB-Rolle) gelten und nicht umgangen werden.
--
-- Die Auth.js-eigenen Tabellen (account, session, verificationToken) bleiben
-- bewusst ohne RLS: Auth.js kennt app.current_verein_id nicht und greift über
-- eigene, userId-gebundene Queries zu (Login würde sonst brechen). "user"
-- selbst bekommt RLS, da es die fachliche Mandanten-Spalte verein_id trägt.

-- verein: eine Session sieht/ändert nur den eigenen Mandanten-Datensatz.
ALTER TABLE "verein" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verein" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "verein"
  USING (id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (id = current_setting('app.current_verein_id', true)::uuid);

-- mannschaft
ALTER TABLE "mannschaft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mannschaft" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "mannschaft"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);

-- user (Funktionsträger + Admins): bewusst OHNE RLS.
-- Auth.js muss beim Login einen Nutzer per E-Mail finden können, BEVOR
-- app.current_verein_id überhaupt bekannt ist (der Mandant ergibt sich erst
-- aus dem gefundenen user-Datensatz) — mit FORCE RLS würde jeder Login-Versuch
-- ins Leere laufen. Die Tenant-Trennung für "user" muss deshalb auf
-- Anwendungsebene sichergestellt werden (jede Admin-Query MUSS nach
-- verein_id filtern, z.B. eq(users.vereinId, session.vereinId)).
-- Alle abhängigen Tabellen unten prüfen den Mandanten weiterhin per Join
-- gegen user.verein_id bzw. termin.verein_id — das bleibt RLS-geschützt.

-- funktionstraeger_rolle: kein eigenes verein_id, daher Join über user.
ALTER TABLE "funktionstraeger_rolle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "funktionstraeger_rolle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "funktionstraeger_rolle"
  USING (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = funktionstraeger_rolle.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = funktionstraeger_rolle.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));

-- schiedsrichter_profil: Join über user.
ALTER TABLE "schiedsrichter_profil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schiedsrichter_profil" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schiedsrichter_profil"
  USING (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = schiedsrichter_profil.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = schiedsrichter_profil.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));

-- termin
ALTER TABLE "termin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "termin" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "termin"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);

-- termin_zuordnung: kein eigenes verein_id, daher Join über termin.
ALTER TABLE "termin_zuordnung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "termin_zuordnung" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "termin_zuordnung"
  USING (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = termin_zuordnung.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = termin_zuordnung.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));

-- zuschuss: Join über termin.
ALTER TABLE "zuschuss" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zuschuss" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "zuschuss"
  USING (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = zuschuss.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = zuschuss.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));

-- ics_sync_log: Join über user (schiedsrichter_id).
ALTER TABLE "ics_sync_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ics_sync_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ics_sync_log"
  USING (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = ics_sync_log.schiedsrichter_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = ics_sync_log.schiedsrichter_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));

-- benachrichtigung: Join über termin.
ALTER TABLE "benachrichtigung" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "benachrichtigung" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "benachrichtigung"
  USING (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = benachrichtigung.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "termin" t
    WHERE t.id = benachrichtigung.termin_id
      AND t.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));
