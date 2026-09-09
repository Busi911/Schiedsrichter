ALTER TYPE "public"."funktionstraeger_typ" ADD VALUE 'kassierer' BEFORE 'schiedsrichterwart';--> statement-breakpoint
ALTER TABLE "mannschaft" ADD COLUMN "kassierer_bedarf_deaktiviert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "testspiel_kassierer_bedarf" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "turnier_kassierer_bedarf" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rundenspiel_kassierer_bedarf" integer DEFAULT 0 NOT NULL;