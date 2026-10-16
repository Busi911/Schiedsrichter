CREATE TABLE "vereinstermin_antwort" (
	"vereinstermin_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"verein_id" uuid NOT NULL,
	"antwort" text NOT NULL,
	"kommentar" text,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vereinstermin_antwort_vereinstermin_id_user_id_pk" PRIMARY KEY("vereinstermin_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "vereinstermin_sichtbar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vereinstermin_id" uuid NOT NULL,
	"verein_id" uuid NOT NULL,
	"rolle" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "vereinstermin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"titel" text NOT NULL,
	"art" text DEFAULT 'sitzung' NOT NULL,
	"beschreibung" text,
	"ort" text,
	"start" timestamp NOT NULL,
	"ende" timestamp,
	"sichtbarkeit" text DEFAULT 'alle' NOT NULL,
	"antwort_abfrage" boolean DEFAULT true NOT NULL,
	"erstellt_von" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "vereinstermin_hinweise_aktiviert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "vereinstermine_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vereinstermin_antwort" ADD CONSTRAINT "vereinstermin_antwort_vereinstermin_id_vereinstermin_id_fk" FOREIGN KEY ("vereinstermin_id") REFERENCES "public"."vereinstermin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin_antwort" ADD CONSTRAINT "vereinstermin_antwort_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin_antwort" ADD CONSTRAINT "vereinstermin_antwort_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin_sichtbar" ADD CONSTRAINT "vereinstermin_sichtbar_vereinstermin_id_vereinstermin_id_fk" FOREIGN KEY ("vereinstermin_id") REFERENCES "public"."vereinstermin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin_sichtbar" ADD CONSTRAINT "vereinstermin_sichtbar_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin_sichtbar" ADD CONSTRAINT "vereinstermin_sichtbar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin" ADD CONSTRAINT "vereinstermin_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vereinstermin" ADD CONSTRAINT "vereinstermin_erstellt_von_user_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Vereinstermine tragen verein_id direkt, Mandantentrennung wie bei mannschaft/halle (siehe 0001, 0047).
ALTER TABLE "vereinstermin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vereinstermin" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "vereinstermin"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "vereinstermin_sichtbar" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vereinstermin_sichtbar" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "vereinstermin_sichtbar"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "vereinstermin_antwort" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vereinstermin_antwort" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "vereinstermin_antwort"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
