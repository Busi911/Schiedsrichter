ALTER TABLE "verein_kontakt" ADD COLUMN "ansprache_kanal" text;--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD COLUMN "ansprache_email" text;--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD COLUMN "ansprache_gesendet_am" timestamp;--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD COLUMN "followup_gesendet_am" timestamp;--> statement-breakpoint
ALTER TABLE "verein_kontakt" ADD COLUMN "outreach_abgemeldet_am" timestamp;