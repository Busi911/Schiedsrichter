ALTER TABLE "user" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "muss_passwort_aendern" boolean DEFAULT false NOT NULL;