ALTER TABLE "user" ADD COLUMN "kalender_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_kalender_token_unique" UNIQUE("kalender_token");