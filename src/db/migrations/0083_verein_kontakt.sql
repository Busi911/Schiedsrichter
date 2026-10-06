CREATE TABLE "verein_kontakt" (
	"verein_id" uuid PRIMARY KEY NOT NULL,
	"instagram" text,
	"angeschrieben_am" timestamp,
	"notiz" text
);
--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD CONSTRAINT "verein_kontakt_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Interne Notizen: nur die privilegierte Rolle (adminDb), nie ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "verein_kontakt" FROM app_user;
  END IF;
END $$;
