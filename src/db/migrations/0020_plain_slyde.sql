DROP TABLE "zuschuss" CASCADE;--> statement-breakpoint
DROP TABLE "zuschussart" CASCADE;--> statement-breakpoint
ALTER TABLE "verein" DROP COLUMN "zuschuesse_aktiviert";--> statement-breakpoint
DROP TYPE "public"."zuschuss_status";