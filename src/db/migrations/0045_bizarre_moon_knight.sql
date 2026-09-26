CREATE TABLE "system_einstellungen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"beta_verein_limit" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warteliste" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vereinsname" text NOT NULL,
	"admin_name" text NOT NULL,
	"admin_email" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- system_einstellungen ist ein Singleton — die App geht immer von genau
-- einer Zeile aus (siehe holeSystemEinstellungen in lib/system-einstellungen.ts).
INSERT INTO "system_einstellungen" DEFAULT VALUES;
