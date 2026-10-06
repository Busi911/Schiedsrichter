ALTER TABLE "liga_verein_logo" ADD COLUMN "quelle" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_verein_logo" ADD COLUMN "quell_pfad" text;--> statement-breakpoint
ALTER TABLE "liga_verein_logo" ADD COLUMN "quell_hash" text;--> statement-breakpoint
ALTER TABLE "liga_verein_logo" ADD COLUMN "abgerufen_am" timestamp;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD COLUMN "logo_geprueft_am" timestamp;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD COLUMN "logo_auto_aus" boolean DEFAULT false NOT NULL;