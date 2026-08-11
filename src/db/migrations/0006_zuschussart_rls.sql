-- zuschussart trägt verein_id direkt, analog zu mannschaft/termin (siehe 0001).
ALTER TABLE "zuschussart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zuschussart" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "zuschussart"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
