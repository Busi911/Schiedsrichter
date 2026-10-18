CREATE TABLE IF NOT EXISTS "mitgliedsart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mitglied" ADD COLUMN IF NOT EXISTS "art_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitgliedsart" ADD CONSTRAINT "mitgliedsart_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mitgliedsart_verein_name_idx" ON "mitgliedsart" USING btree ("verein_id",lower("name"));--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitglied" ADD CONSTRAINT "mitglied_art_id_mitgliedsart_id_fk" FOREIGN KEY ("art_id") REFERENCES "public"."mitgliedsart"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- Mandantentrennung wie bei mitglied/beitragsklasse (0117).
ALTER TABLE "mitgliedsart" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mitgliedsart" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mitgliedsart";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mitgliedsart"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
