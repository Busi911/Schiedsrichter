ALTER TABLE "verein_kontakt" ADD COLUMN "outreach_versuche" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD COLUMN "outreach_letzter_versuch" timestamp;
