CREATE TABLE "halle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainingszeit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"mannschaft_id" uuid NOT NULL,
	"halle_id" uuid NOT NULL,
	"wochentag" integer NOT NULL,
	"start_minuten" integer NOT NULL,
	"end_minuten" integer NOT NULL,
	"farbe" text DEFAULT '#3b82f6' NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "halle" ADD CONSTRAINT "halle_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingszeit" ADD CONSTRAINT "trainingszeit_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingszeit" ADD CONSTRAINT "trainingszeit_mannschaft_id_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."mannschaft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainingszeit" ADD CONSTRAINT "trainingszeit_halle_id_halle_id_fk" FOREIGN KEY ("halle_id") REFERENCES "public"."halle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- halle/trainingszeit tragen verein_id direkt, analog zu mannschaft (siehe 0001).
ALTER TABLE "halle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "halle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "halle"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);

ALTER TABLE "trainingszeit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "trainingszeit" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trainingszeit"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);