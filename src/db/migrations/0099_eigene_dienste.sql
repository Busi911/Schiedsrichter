ALTER TYPE "public"."funktionstraeger_typ" ADD VALUE 'eigener_dienst';--> statement-breakpoint
ALTER TYPE "public"."funktionstraeger_typ" ADD VALUE 'dienstwart';--> statement-breakpoint
CREATE TABLE "dienst_art_mannschaft" (
	"dienst_art_id" uuid NOT NULL,
	"mannschaft_id" uuid NOT NULL,
	"verein_id" uuid NOT NULL,
	CONSTRAINT "dienst_art_mannschaft_dienst_art_id_mannschaft_id_pk" PRIMARY KEY("dienst_art_id","mannschaft_id")
);
--> statement-breakpoint
CREATE TABLE "dienst_art" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"beschreibung" text,
	"aktiv" boolean DEFAULT true NOT NULL,
	"fuer_heimspiele" boolean DEFAULT true NOT NULL,
	"fuer_auswaertsspiele" boolean DEFAULT false NOT NULL,
	"fuer_freundschaftsspiele" boolean DEFAULT false NOT NULL,
	"fuer_turniere" boolean DEFAULT false NOT NULL,
	"standard_bedarf" integer DEFAULT 1 NOT NULL,
	"nur_ausgewaehlte_mannschaften" boolean DEFAULT false NOT NULL,
	"reihenfolge" integer DEFAULT 0 NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "termin_dienst_bedarf" (
	"termin_id" uuid NOT NULL,
	"dienst_art_id" uuid NOT NULL,
	"verein_id" uuid NOT NULL,
	"bedarf" integer NOT NULL,
	CONSTRAINT "termin_dienst_bedarf_termin_id_dienst_art_id_pk" PRIMARY KEY("termin_id","dienst_art_id")
);
--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD COLUMN "dienst_art_id" uuid;--> statement-breakpoint
ALTER TABLE "dienst_art_mannschaft" ADD CONSTRAINT "dienst_art_mannschaft_dienst_art_id_dienst_art_id_fk" FOREIGN KEY ("dienst_art_id") REFERENCES "public"."dienst_art"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienst_art_mannschaft" ADD CONSTRAINT "dienst_art_mannschaft_mannschaft_id_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."mannschaft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienst_art_mannschaft" ADD CONSTRAINT "dienst_art_mannschaft_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dienst_art" ADD CONSTRAINT "dienst_art_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_dienst_bedarf" ADD CONSTRAINT "termin_dienst_bedarf_termin_id_termin_id_fk" FOREIGN KEY ("termin_id") REFERENCES "public"."termin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_dienst_bedarf" ADD CONSTRAINT "termin_dienst_bedarf_dienst_art_id_dienst_art_id_fk" FOREIGN KEY ("dienst_art_id") REFERENCES "public"."dienst_art"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_dienst_bedarf" ADD CONSTRAINT "termin_dienst_bedarf_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD CONSTRAINT "termin_zuordnung_dienst_art_id_dienst_art_id_fk" FOREIGN KEY ("dienst_art_id") REFERENCES "public"."dienst_art"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Eigene Dienste tragen verein_id direkt, Mandantentrennung wie bei mannschaft/halle (siehe 0001, 0047).
ALTER TABLE "dienst_art" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dienst_art" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dienst_art"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "dienst_art_mannschaft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dienst_art_mannschaft" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "dienst_art_mannschaft"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "termin_dienst_bedarf" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "termin_dienst_bedarf" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "termin_dienst_bedarf"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);
