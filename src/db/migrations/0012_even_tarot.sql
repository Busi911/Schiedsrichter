CREATE TABLE "push_abo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"erstellt_am" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_abo_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "telefonnummer" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "nuliga_halle_1_id" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "nuliga_halle_2_id" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "nuliga_halle_3_id" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "nuliga_auto_import_aktiviert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "push_abo" ADD CONSTRAINT "push_abo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- push_abo: kein eigenes verein_id, daher Join über user (analog schiedsrichter_profil, siehe 0001).
ALTER TABLE "push_abo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "push_abo" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "push_abo"
  USING (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = push_abo.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = push_abo.user_id
      AND u.verein_id = current_setting('app.current_verein_id', true)::uuid
  ));