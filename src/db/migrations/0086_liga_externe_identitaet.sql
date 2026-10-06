CREATE TABLE "liga_externe_identitaet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liga_verein_id" uuid NOT NULL,
	"quelle" text NOT NULL,
	"externe_id" text NOT NULL,
	"externer_code" text,
	"name" text,
	"logo_url" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liga_externe_identitaet" ADD CONSTRAINT "liga_externe_identitaet_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_externe_identitaet_verein_quelle_idx" ON "liga_externe_identitaet" USING btree ("liga_verein_id","quelle","externe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_externe_identitaet_hbl_idx" ON "liga_externe_identitaet" USING btree ("quelle","externe_id") WHERE "liga_externe_identitaet"."quelle" = 'hbl';--> statement-breakpoint
-- Nur die privilegierte Rolle (adminDb): Zuordnung wird vom Systemadmin gepflegt, nie von einem Mandanten-Request.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "liga_externe_identitaet" FROM app_user;
  END IF;
END $$;
