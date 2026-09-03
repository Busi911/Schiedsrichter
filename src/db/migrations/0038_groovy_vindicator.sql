ALTER TABLE "mannschaft" ADD COLUMN "ordner_bedarf_deaktiviert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mannschaft" ADD COLUMN "kioskdienst_bedarf_deaktiviert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mannschaft" ADD COLUMN "zeitnehmer_bedarf_deaktiviert" boolean DEFAULT false NOT NULL;