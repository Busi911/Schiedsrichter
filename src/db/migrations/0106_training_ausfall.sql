CREATE TABLE "training_ausfall" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"trainingszeit_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"grund" text,
	"gemeldet_von" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "training_ausfall_hinweise_aktiviert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "training_fuer_alle_sichtbar" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_ausfall" ADD CONSTRAINT "training_ausfall_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_ausfall" ADD CONSTRAINT "training_ausfall_trainingszeit_id_trainingszeit_id_fk" FOREIGN KEY ("trainingszeit_id") REFERENCES "public"."trainingszeit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_ausfall" ADD CONSTRAINT "training_ausfall_gemeldet_von_user_id_fk" FOREIGN KEY ("gemeldet_von") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_ausfall_zeit_datum_idx" ON "training_ausfall" USING btree ("trainingszeit_id","datum");--> statement-breakpoint
-- Trainingsausfälle tragen verein_id direkt, Mandantentrennung wie bei trainingszeit/halle (siehe 0001, 0047).
ALTER TABLE "training_ausfall" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_ausfall" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "training_ausfall"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
