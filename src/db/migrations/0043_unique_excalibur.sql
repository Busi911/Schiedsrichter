CREATE TYPE "public"."lizenz_erinnerung_stufe" AS ENUM('60_tage', '30_tage', '7_tage', 'abgelaufen');--> statement-breakpoint
CREATE TABLE "produkt_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"seite" text NOT NULL,
	"nachricht" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funktionstraeger_rolle" ADD COLUMN "lizenz_gueltig_bis" timestamp;--> statement-breakpoint
ALTER TABLE "funktionstraeger_rolle" ADD COLUMN "lizenz_erinnerung_stufe" "lizenz_erinnerung_stufe";--> statement-breakpoint
ALTER TABLE "produkt_feedback" ADD CONSTRAINT "produkt_feedback_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produkt_feedback" ADD CONSTRAINT "produkt_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- produkt_feedback trägt verein_id direkt, analog zu mannschaft/ignorierte_mannschaft (siehe 0001/0026).
-- Lesen für /system/feedback läuft über adminDb (BYPASSRLS), siehe src/db/admin.ts.
ALTER TABLE "produkt_feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produkt_feedback" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "produkt_feedback"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);