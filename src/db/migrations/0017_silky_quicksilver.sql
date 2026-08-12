ALTER TYPE "public"."funktionstraeger_typ" ADD VALUE 'schiedsrichterwart';--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "testspiel_zeitnehmer_bedarf" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "turnier_zeitnehmer_bedarf" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rundenspiel_zeitnehmer_bedarf" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zeitnehmer_sekretaer_max" integer DEFAULT 2 NOT NULL;