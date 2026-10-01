CREATE TABLE "liga_verein_zusatzquelle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liga_verein_id" uuid NOT NULL,
	"nuliga_club_id" text NOT NULL,
	"bezeichnung" text,
	"kategorien" text DEFAULT '' NOT NULL,
	"name_enthaelt" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liga_verein_zusatzquelle" ADD CONSTRAINT "liga_verein_zusatzquelle_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_zusatzquelle_verein_club_idx" ON "liga_verein_zusatzquelle" USING btree ("liga_verein_id","nuliga_club_id");