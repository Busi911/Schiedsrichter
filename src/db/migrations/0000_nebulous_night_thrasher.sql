CREATE TYPE "public"."funktionstraeger_typ" AS ENUM('schiedsrichter', 'zeitnehmer', 'sekretaer', 'trainer', 'ordner', 'kioskdienst');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('noch_nie', 'erfolgreich', 'fehler');--> statement-breakpoint
CREATE TYPE "public"."termin_quelle" AS ENUM('ics_feed', 'manuell');--> statement-breakpoint
CREATE TYPE "public"."termin_typ" AS ENUM('spiel_ics', 'testspiel', 'turnier');--> statement-breakpoint
CREATE TYPE "public"."zuordnung_quelle" AS ENUM('zugeordnet_durch_admin', 'selbst_angemeldet');--> statement-breakpoint
CREATE TYPE "public"."zuschuss_status" AS ENUM('offen', 'exportiert');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "benachrichtigung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"termin_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"typ" text NOT NULL,
	"versendet_am" timestamp
);
--> statement-breakpoint
CREATE TABLE "funktionstraeger_rolle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"typ" "funktionstraeger_typ" NOT NULL,
	"mannschaft_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ics_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schiedsrichter_id" text NOT NULL,
	"synchronisiert_am" timestamp DEFAULT now() NOT NULL,
	"neu_count" integer DEFAULT 0 NOT NULL,
	"aktualisiert_count" integer DEFAULT 0 NOT NULL,
	"entfernt_count" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" NOT NULL,
	"fehlermeldung" text
);
--> statement-breakpoint
CREATE TABLE "mannschaft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"name" text NOT NULL,
	"altersklasse" text
);
--> statement-breakpoint
CREATE TABLE "schiedsrichter_profil" (
	"user_id" text PRIMARY KEY NOT NULL,
	"lizenznummer" text,
	"ics_feed_url" text,
	"letzter_sync_am" timestamp,
	"letzter_sync_status" "sync_status" DEFAULT 'noch_nie' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "termin_zuordnung" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"termin_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"funktionstraeger_typ" "funktionstraeger_typ" NOT NULL,
	"quelle" "zuordnung_quelle" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "termin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"typ" "termin_typ" NOT NULL,
	"start" timestamp NOT NULL,
	"ende" timestamp,
	"ort" text,
	"beschreibung" text,
	"quelle" "termin_quelle" NOT NULL,
	"erstellt_von" text,
	"mannschaft_id" uuid,
	"ics_uid" text,
	"ics_schiedsrichter_id" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	"verein_id" uuid,
	"ist_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verein" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"adresse" text,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "zuschuss" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"termin_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"satz" numeric(10, 2) NOT NULL,
	"berechneter_betrag" numeric(10, 2) NOT NULL,
	"status" "zuschuss_status" DEFAULT 'offen' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benachrichtigung" ADD CONSTRAINT "benachrichtigung_termin_id_termin_id_fk" FOREIGN KEY ("termin_id") REFERENCES "public"."termin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benachrichtigung" ADD CONSTRAINT "benachrichtigung_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funktionstraeger_rolle" ADD CONSTRAINT "funktionstraeger_rolle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funktionstraeger_rolle" ADD CONSTRAINT "funktionstraeger_rolle_mannschaft_id_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."mannschaft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ics_sync_log" ADD CONSTRAINT "ics_sync_log_schiedsrichter_id_user_id_fk" FOREIGN KEY ("schiedsrichter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mannschaft" ADD CONSTRAINT "mannschaft_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schiedsrichter_profil" ADD CONSTRAINT "schiedsrichter_profil_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD CONSTRAINT "termin_zuordnung_termin_id_termin_id_fk" FOREIGN KEY ("termin_id") REFERENCES "public"."termin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD CONSTRAINT "termin_zuordnung_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_erstellt_von_user_id_fk" FOREIGN KEY ("erstellt_von") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_mannschaft_id_mannschaft_id_fk" FOREIGN KEY ("mannschaft_id") REFERENCES "public"."mannschaft"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_ics_schiedsrichter_id_user_id_fk" FOREIGN KEY ("ics_schiedsrichter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuschuss" ADD CONSTRAINT "zuschuss_termin_id_termin_id_fk" FOREIGN KEY ("termin_id") REFERENCES "public"."termin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuschuss" ADD CONSTRAINT "zuschuss_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;