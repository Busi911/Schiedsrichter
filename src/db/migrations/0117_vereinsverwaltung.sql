CREATE TABLE IF NOT EXISTS "beitragsklasse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"betrag" integer NOT NULL,
	"beschreibung" text,
	"aktiv" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "beitritt_antrag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vorname" text NOT NULL,
	"geburtsdatum" date,
	"email" text NOT NULL,
	"telefon" text,
	"geschlecht" text,
	"mannschaft_id" uuid,
	"einwilligungen" jsonb,
	"erstellt_am" timestamp DEFAULT now(),
	"status" text DEFAULT 'offen' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mitglied_mannschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mitglied_id" uuid NOT NULL,
	"mannschaft_id" uuid NOT NULL,
	"saison" text NOT NULL,
	"rolle" text DEFAULT 'spieler' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mitglied" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vorname" text NOT NULL,
	"geburtsdatum" date,
	"email" text,
	"telefon" text,
	"geschlecht" text,
	"status" text DEFAULT 'aktiv' NOT NULL,
	"eintrittsdatum" date DEFAULT now(),
	"austrittsdatum" date,
	"bemerkung" text,
	"erstellt_am" timestamp DEFAULT now(),
	"aktualisiert_am" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN IF NOT EXISTS "vereinsverwaltung_aktiv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "beitragsklasse" ADD CONSTRAINT "beitragsklasse_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "beitritt_antrag" ADD CONSTRAINT "beitritt_antrag_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "beitritt_antrag" ADD CONSTRAINT "beitritt_antrag_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitglied_mannschaft" ADD CONSTRAINT "mitglied_mannschaft_mitglied_id_mitglied_id_fk" FOREIGN KEY ("mitglied_id") REFERENCES "public"."mitglied"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitglied_mannschaft" ADD CONSTRAINT "mitglied_mannschaft_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitglied" ADD CONSTRAINT "mitglied_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mitglied_mannschaft_mitglied_mannschaft_saison_idx" ON "mitglied_mannschaft" USING btree ("mitglied_id","mannschaft_id","saison");--> statement-breakpoint
-- Mandantentrennung wie bei vereinstermin (siehe 0001, 0047, 0107).
ALTER TABLE "mitglied" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mitglied" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mitglied";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mitglied"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "beitragsklasse" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "beitragsklasse" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "beitragsklasse";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "beitragsklasse"
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "mitglied_mannschaft" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mitglied_mannschaft" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON "mitglied_mannschaft";--> statement-breakpoint
CREATE POLICY tenant_isolation ON "mitglied_mannschaft"
  USING (EXISTS (SELECT 1 FROM mitglied m WHERE m.id = mitglied_id AND m.verein_id = current_setting('app.current_verein_id', true)::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM mitglied m WHERE m.id = mitglied_id AND m.verein_id = current_setting('app.current_verein_id', true)::uuid));--> statement-breakpoint
-- Beitrittsanträge: Lesen/Ändern/Löschen nur im eigenen Verein, Anlegen ohne Einschränkung (öffentliches Formular ohne Login).
ALTER TABLE "beitritt_antrag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "beitritt_antrag" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_select ON "beitritt_antrag";--> statement-breakpoint
CREATE POLICY tenant_select ON "beitritt_antrag" FOR SELECT
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS tenant_update ON "beitritt_antrag";--> statement-breakpoint
CREATE POLICY tenant_update ON "beitritt_antrag" FOR UPDATE
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid)
  WITH CHECK (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS tenant_delete ON "beitritt_antrag";--> statement-breakpoint
CREATE POLICY tenant_delete ON "beitritt_antrag" FOR DELETE
  USING (verein_id = current_setting('app.current_verein_id', true)::uuid);--> statement-breakpoint
DROP POLICY IF EXISTS public_insert ON "beitritt_antrag";--> statement-breakpoint
CREATE POLICY public_insert ON "beitritt_antrag" FOR INSERT
  WITH CHECK (true);
