CREATE TYPE "public"."freundschafts_typ" AS ENUM('freundschaftsspiel', 'turnier');--> statement-breakpoint
ALTER TABLE "termin" ADD COLUMN "freundschafts_typ" "freundschafts_typ";