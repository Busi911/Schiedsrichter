CREATE TABLE "stammdaten_aenderung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"feld" text NOT NULL,
	"bisheriger_wert" text,
	"neuer_wert" text,
	"grund" text NOT NULL,
	"angefragt_von" text,
	"status" text DEFAULT 'offen' NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	"entschieden_am" timestamp,
	"entscheidung_notiz" text
);
--> statement-breakpoint
ALTER TABLE "stammdaten_aenderung" ADD CONSTRAINT "stammdaten_aenderung_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Änderungsanträge: nur die privilegierte Rolle (adminDb), nie ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "stammdaten_aenderung" FROM app_user;
  END IF;
END $$;
