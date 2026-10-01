CREATE TABLE "verein_vorschau_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"token" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	"gueltig_bis" timestamp NOT NULL,
	"widerrufen_am" timestamp,
	CONSTRAINT "verein_vorschau_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "verein_vorschau_link" ADD CONSTRAINT "verein_vorschau_link_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Systemweite Tabelle: nur adminDb, nie ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "verein_vorschau_link" FROM app_user;
  END IF;
END $$;
