CREATE TABLE IF NOT EXISTS "funktionstraeger_kein_duplikat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"user_id_a" text NOT NULL,
	"user_id_b" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funktionstraeger_kein_duplikat" ADD CONSTRAINT "funktionstraeger_kein_duplikat_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funktionstraeger_kein_duplikat" ADD CONSTRAINT "funktionstraeger_kein_duplikat_user_id_a_user_id_fk" FOREIGN KEY ("user_id_a") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "funktionstraeger_kein_duplikat" ADD CONSTRAINT "funktionstraeger_kein_duplikat_user_id_b_user_id_fk" FOREIGN KEY ("user_id_b") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funktionstraeger_kein_duplikat_paar_idx" ON "funktionstraeger_kein_duplikat" USING btree ("verein_id","user_id_a","user_id_b");--> statement-breakpoint
-- Trägt verein_id direkt: Mandantentrennung wie bei training_ausfall (siehe 0106).
ALTER TABLE "funktionstraeger_kein_duplikat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "funktionstraeger_kein_duplikat" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "funktionstraeger_kein_duplikat";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "funktionstraeger_kein_duplikat"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
