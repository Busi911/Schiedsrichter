CREATE TABLE "verein_sponsor" (
	"verein_id" uuid PRIMARY KEY NOT NULL,
	"aktiv" boolean DEFAULT false NOT NULL,
	"name" text,
	"link" text,
	"dauer_sekunden" integer DEFAULT 3 NOT NULL,
	"gueltig_bis" date,
	"png" "bytea",
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verein_sponsor" ADD CONSTRAINT "verein_sponsor_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Systemweite Tabelle: nur adminDb (Systemadmin), nie ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "verein_sponsor" FROM app_user;
  END IF;
END $$;
