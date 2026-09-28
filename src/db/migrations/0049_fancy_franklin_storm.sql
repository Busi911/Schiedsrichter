ALTER TABLE "halle" ADD COLUMN "abteil_anzahl" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "halle" ADD COLUMN "abteil_1_name" text;--> statement-breakpoint
ALTER TABLE "halle" ADD COLUMN "abteil_2_name" text;--> statement-breakpoint
ALTER TABLE "halle" ADD COLUMN "abteil_3_name" text;--> statement-breakpoint
ALTER TABLE "halle" ADD COLUMN "abteil_4_name" text;--> statement-breakpoint
ALTER TABLE "trainingszeit" ADD COLUMN "abteil_nummer" integer;