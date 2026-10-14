CREATE TABLE "fahrt_mitfahrer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zuordnung_id" uuid NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dienst_art" ADD COLUMN "fahrgemeinschaft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD COLUMN "plaetze" integer;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD COLUMN "fahrt_hinweis" text;--> statement-breakpoint
ALTER TABLE "fahrt_mitfahrer" ADD CONSTRAINT "fahrt_mitfahrer_zuordnung_id_termin_zuordnung_id_fk" FOREIGN KEY ("zuordnung_id") REFERENCES "public"."termin_zuordnung"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fahrt_mitfahrer" ADD CONSTRAINT "fahrt_mitfahrer_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fahrt_mitfahrer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fahrt_mitfahrer" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fahrt_mitfahrer"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
