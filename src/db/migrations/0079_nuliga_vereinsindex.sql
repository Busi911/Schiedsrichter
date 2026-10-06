CREATE TABLE "nuliga_vereinsindex" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verband" text DEFAULT 'HHV' NOT NULL,
	"club_id" text NOT NULL,
	"nummer" text,
	"name" text NOT NULL,
	"bezirk" text,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "nuliga_vereinsindex_verband_club_idx" ON "nuliga_vereinsindex" USING btree ("verband","club_id");--> statement-breakpoint
-- Nur die privilegierte Rolle (adminDb) greift zu, nie ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "nuliga_vereinsindex" FROM app_user;
  END IF;
END $$;
