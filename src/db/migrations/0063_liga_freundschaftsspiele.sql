ALTER TABLE "liga_gruppe" ADD COLUMN "ist_freundschaft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD COLUMN "ist_freundschaft" boolean DEFAULT false NOT NULL;