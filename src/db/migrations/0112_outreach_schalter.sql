ALTER TABLE "system_einstellungen" ADD COLUMN "outreach_aktiv" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_einstellungen" ADD COLUMN "outreach_pro_lauf" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "system_einstellungen" ADD COLUMN "outreach_nachfass_aktiv" boolean DEFAULT true NOT NULL;