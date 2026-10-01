CREATE TABLE "treuhand_zugriff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_admin_user_id" text NOT NULL,
	"verein_id" uuid NOT NULL,
	"art" text NOT NULL,
	"gestartet_am" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "treuhand_zugriff_system_admin_user_id_unique" UNIQUE("system_admin_user_id")
);
--> statement-breakpoint
CREATE TABLE "verein_protokoll" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"aktion" text NOT NULL,
	"akteur" text,
	"details" text,
	"zeitpunkt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "status" text DEFAULT 'aktiv' NOT NULL;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "uebergeben_am" timestamp;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "support_zugriff_bis" timestamp;--> statement-breakpoint
ALTER TABLE "treuhand_zugriff" ADD CONSTRAINT "treuhand_zugriff_system_admin_user_id_user_id_fk" FOREIGN KEY ("system_admin_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treuhand_zugriff" ADD CONSTRAINT "treuhand_zugriff_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verein_protokoll" ADD CONSTRAINT "verein_protokoll_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Systemweite Tabellen: nur die privilegierte Rolle (adminDb) greift zu, nie
-- ein Mandanten-Request (app_user).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "treuhand_zugriff", "verein_protokoll" FROM app_user;
  END IF;
END $$;
