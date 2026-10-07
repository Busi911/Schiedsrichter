ALTER TABLE "verein" ADD COLUMN "tarif" text DEFAULT 'beta' NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "sponsor_uebernimmt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rechnung_email" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rechnung_ansprechpartner" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zahlung_bis" timestamp;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zahlung_faellig_am" timestamp;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zahlung_sperre_aus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zahlung_mail_marke" text;