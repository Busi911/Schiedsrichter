CREATE TABLE IF NOT EXISTS "mannschaft_sponsor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"liga_mannschaft_id" uuid NOT NULL,
	"aktiv" boolean DEFAULT false NOT NULL,
	"name" text,
	"link" text,
	"gueltig_bis" date,
	"bild" "bytea",
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mannschaft_sponsor" ADD CONSTRAINT "mannschaft_sponsor_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mannschaft_sponsor" ADD CONSTRAINT "mannschaft_sponsor_liga_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("liga_mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mannschaft_sponsor_mannschaft_idx" ON "mannschaft_sponsor" USING btree ("liga_mannschaft_id");--> statement-breakpoint
-- Trägt verein_id direkt: Mandantentrennung wie bei training_ausfall (siehe 0106). Die öffentliche Mannschaftsseite
-- liest über adminDb mit ausdrücklichem verein_id-Filter.
ALTER TABLE "mannschaft_sponsor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mannschaft_sponsor" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mannschaft_sponsor";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mannschaft_sponsor"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
