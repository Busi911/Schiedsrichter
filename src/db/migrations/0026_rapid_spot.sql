CREATE TABLE "ignorierte_mannschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"normalisierter_name" text NOT NULL,
	"kategorie" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ignorierte_mannschaft" ADD CONSTRAINT "ignorierte_mannschaft_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ignorierte_mannschaft_verein_name_kategorie_idx" ON "ignorierte_mannschaft" USING btree ("verein_id","normalisierter_name","kategorie");--> statement-breakpoint
-- ignorierte_mannschaft trägt verein_id direkt, analog zu mannschaft/termin (siehe 0001).
ALTER TABLE "ignorierte_mannschaft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ignorierte_mannschaft" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ignorierte_mannschaft"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);