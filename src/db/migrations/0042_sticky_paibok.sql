ALTER TABLE "user" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pending_email_token" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "pending_email_token_ablauf_am" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_pending_email_token_unique" UNIQUE("pending_email_token");