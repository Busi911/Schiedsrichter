ALTER TABLE "user" ADD COLUMN "wochen_digest_aktiviert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "termin_erinnerung_aktiviert" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "offene_schiedsrichter_erinnerung_aktiviert" boolean DEFAULT true NOT NULL;