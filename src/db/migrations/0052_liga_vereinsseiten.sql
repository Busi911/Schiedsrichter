CREATE TYPE "public"."liga_kategorie" AS ENUM('herren', 'damen', 'jugend_maennlich', 'jugend_weiblich', 'kinder', 'sonstige');--> statement-breakpoint
CREATE TYPE "public"."liga_spiel_status" AS ENUM('geplant', 'verlegt', 'abgesagt', 'nicht_angetreten', 'gespielt');--> statement-breakpoint
CREATE TYPE "public"."liga_sync_status" AS ENUM('erfolgreich', 'teilweise', 'fehler');--> statement-breakpoint
CREATE TABLE "favorit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"liga_verein_id" uuid,
	"liga_mannschaft_id" uuid,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "favorit_genau_ein_ziel" CHECK (("favorit"."liga_verein_id" IS NOT NULL)::int + ("favorit"."liga_mannschaft_id" IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE TABLE "liga_gruppe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verband" text DEFAULT 'HHV' NOT NULL,
	"nuliga_group_id" text NOT NULL,
	"championship" text NOT NULL,
	"saison" text,
	"liga_name" text NOT NULL,
	"geschlecht" text,
	"altersklasse" text,
	"spielklasse" text,
	"gruppe" text,
	"ist_meldeliste" boolean DEFAULT false NOT NULL,
	"tabelle_synchronisiert_am" timestamp
);
--> statement-breakpoint
CREATE TABLE "liga_mannschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liga_verein_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"schluessel" text NOT NULL,
	"name" text NOT NULL,
	"kategorie" "liga_kategorie" NOT NULL,
	"geschlecht" text,
	"altersklasse" text,
	"untergruppe" text,
	"nummer" integer DEFAULT 1 NOT NULL,
	"aktiv" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_spiel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gruppe_id" uuid NOT NULL,
	"spielnummer" integer NOT NULL,
	"meeting_id" text,
	"datum" date NOT NULL,
	"uhrzeit" text,
	"beginn" timestamp with time zone,
	"urspruenglicher_beginn" timestamp with time zone,
	"halle_name" text,
	"halle_nummer" text,
	"halle_nuliga_id" text,
	"heim_name" text NOT NULL,
	"gast_name" text NOT NULL,
	"heim_teamtable_id" text,
	"gast_teamtable_id" text,
	"tore_heim" integer,
	"tore_gast" integer,
	"halbzeit_heim" integer,
	"halbzeit_gast" integer,
	"ergebnis_bestaetigt" boolean DEFAULT false NOT NULL,
	"status" "liga_spiel_status" DEFAULT 'geplant' NOT NULL,
	"synchronisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_sync_lauf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"liga_verein_id" uuid NOT NULL,
	"art" text NOT NULL,
	"gestartet_am" timestamp DEFAULT now() NOT NULL,
	"dauer_ms" integer,
	"anfragen" integer DEFAULT 0 NOT NULL,
	"neu" integer DEFAULT 0 NOT NULL,
	"aktualisiert" integer DEFAULT 0 NOT NULL,
	"status" "liga_sync_status" NOT NULL,
	"meldungen" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_tabellenzeile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gruppe_id" uuid NOT NULL,
	"nuliga_teamtable_id" text NOT NULL,
	"name" text NOT NULL,
	"rang" integer NOT NULL,
	"spiele" integer,
	"siege" integer,
	"unentschieden" integer,
	"niederlagen" integer,
	"tore_plus" integer,
	"tore_minus" integer,
	"punkte_plus" integer,
	"punkte_minus" integer
);
--> statement-breakpoint
CREATE TABLE "liga_teilnahme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mannschaft_id" uuid NOT NULL,
	"gruppe_id" uuid NOT NULL,
	"saison" text NOT NULL,
	"nuliga_teamtable_id" text,
	"nuliga_name" text NOT NULL,
	"rang" integer,
	"punkte_plus" integer,
	"punkte_minus" integer,
	"aktiv" boolean DEFAULT true NOT NULL,
	"synchronisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "liga_verein" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"verband" text DEFAULT 'HHV' NOT NULL,
	"nuliga_club_id" text NOT NULL,
	"struktur_synchronisiert_am" timestamp,
	"spiele_synchronisiert_am" timestamp,
	"sync_status" "liga_sync_status",
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "liga_verein_verein_id_unique" UNIQUE("verein_id"),
	CONSTRAINT "liga_verein_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "favorit" ADD CONSTRAINT "favorit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorit" ADD CONSTRAINT "favorit_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorit" ADD CONSTRAINT "favorit_liga_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("liga_mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_mannschaft" ADD CONSTRAINT "liga_mannschaft_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD CONSTRAINT "liga_spiel_gruppe_id_liga_gruppe_id_fk" FOREIGN KEY ("gruppe_id") REFERENCES "public"."liga_gruppe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_sync_lauf" ADD CONSTRAINT "liga_sync_lauf_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_tabellenzeile" ADD CONSTRAINT "liga_tabellenzeile_gruppe_id_liga_gruppe_id_fk" FOREIGN KEY ("gruppe_id") REFERENCES "public"."liga_gruppe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_teilnahme" ADD CONSTRAINT "liga_teilnahme_mannschaft_id_liga_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."liga_mannschaft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_teilnahme" ADD CONSTRAINT "liga_teilnahme_gruppe_id_liga_gruppe_id_fk" FOREIGN KEY ("gruppe_id") REFERENCES "public"."liga_gruppe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD CONSTRAINT "liga_verein_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorit_user_verein_idx" ON "favorit" USING btree ("user_id","liga_verein_id") WHERE "favorit"."liga_verein_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "favorit_user_mannschaft_idx" ON "favorit" USING btree ("user_id","liga_mannschaft_id") WHERE "favorit"."liga_mannschaft_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_gruppe_verband_gruppe_idx" ON "liga_gruppe" USING btree ("verband","nuliga_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_mannschaft_verein_slug_idx" ON "liga_mannschaft" USING btree ("liga_verein_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_mannschaft_verein_schluessel_idx" ON "liga_mannschaft" USING btree ("liga_verein_id","schluessel");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_spiel_gruppe_nummer_idx" ON "liga_spiel" USING btree ("gruppe_id","spielnummer");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_tabellenzeile_gruppe_team_idx" ON "liga_tabellenzeile" USING btree ("gruppe_id","nuliga_teamtable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_teilnahme_mannschaft_gruppe_idx" ON "liga_teilnahme" USING btree ("mannschaft_id","gruppe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_verein_verband_club_idx" ON "liga_verein" USING btree ("verband","nuliga_club_id");