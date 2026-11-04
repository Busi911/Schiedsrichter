CREATE TABLE IF NOT EXISTS "neuigkeit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"liga_mannschaft_id" uuid,
	"titel" text NOT NULL,
	"text" text NOT NULL,
	"veroeffentlicht_am" timestamp,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "neuigkeiten_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "neuigkeit" ADD CONSTRAINT "neuigkeit_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "neuigkeit" ADD CONSTRAINT "neuigkeit_liga_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("liga_mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "neuigkeit_verein_veroeffentlicht_idx" ON "neuigkeit" USING btree ("verein_id","veroeffentlicht_am");--> statement-breakpoint
-- Trägt verein_id direkt: Mandantentrennung wie bei training_ausfall (siehe 0106). Die öffentlichen Seiten und der Feed lesen
-- über adminDb mit ausdrücklichem verein_id-Filter und nur, wenn der Verein den Schalter neuigkeiten_aktiv eingeschaltet hat.
ALTER TABLE "neuigkeit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "neuigkeit" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "neuigkeit";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "neuigkeit"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
