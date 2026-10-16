CREATE TABLE "training_belegung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"trainingszeit_id" uuid NOT NULL,
	"datum" date NOT NULL,
	"mannschaft_id" uuid NOT NULL,
	"notiz" text,
	"gebucht_von" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_belegung" ADD CONSTRAINT "training_belegung_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_belegung" ADD CONSTRAINT "training_belegung_trainingszeit_id_trainingszeit_id_fk" FOREIGN KEY ("trainingszeit_id") REFERENCES "public"."trainingszeit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_belegung" ADD CONSTRAINT "training_belegung_mannschaft_id_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."mannschaft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_belegung" ADD CONSTRAINT "training_belegung_gebucht_von_user_id_fk" FOREIGN KEY ("gebucht_von") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_belegung_zeit_datum_idx" ON "training_belegung" USING btree ("trainingszeit_id","datum");--> statement-breakpoint
-- Belegungen tragen verein_id direkt, Mandantentrennung wie bei training_ausfall (siehe 0001, 0047, 0106).
ALTER TABLE "training_belegung" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "training_belegung" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "training_belegung"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
