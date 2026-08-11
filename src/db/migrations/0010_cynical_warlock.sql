ALTER TYPE "public"."termin_quelle" ADD VALUE 'rundenspiel_import';--> statement-breakpoint
ALTER TYPE "public"."termin_typ" ADD VALUE 'rundenspiel';--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rundenspiel_ordner_bedarf" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "rundenspiel_kioskdienst_bedarf" integer DEFAULT 0 NOT NULL;