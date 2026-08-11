ALTER TABLE "termin_zuordnung" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD COLUMN "externer_name" text;