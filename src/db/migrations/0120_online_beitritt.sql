ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "beitritt_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "satzung_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "beitritt_antrag_verein_erstellt_idx" ON "beitritt_antrag" USING btree ("verein_id","erstellt_am");
