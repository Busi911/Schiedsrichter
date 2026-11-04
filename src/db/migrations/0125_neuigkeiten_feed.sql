CREATE TABLE IF NOT EXISTS "neuigkeit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"guid" text NOT NULL,
	"titel" text NOT NULL,
	"auszug" text,
	"link" text NOT NULL,
	"veroeffentlicht_am" timestamp NOT NULL,
	"abgerufen_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "neuigkeiten_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "neuigkeiten_feed_url" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "neuigkeiten_abgerufen_am" timestamp;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "neuigkeiten_fehler" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "neuigkeit" ADD CONSTRAINT "neuigkeit_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "neuigkeit_verein_guid_idx" ON "neuigkeit" USING btree ("verein_id","guid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "neuigkeit_verein_datum_idx" ON "neuigkeit" USING btree ("verein_id","veroeffentlicht_am");--> statement-breakpoint
-- Trägt verein_id direkt: Mandantentrennung wie bei training_ausfall (siehe 0106). Geschrieben wird vom Abruf (adminDb, mit
-- ausdrücklichem verein_id); die öffentlichen Seiten lesen über adminDb mit Vereinsfilter und nur bei eingeschaltetem Schalter.
ALTER TABLE "neuigkeit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "neuigkeit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "neuigkeit";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "neuigkeit"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
