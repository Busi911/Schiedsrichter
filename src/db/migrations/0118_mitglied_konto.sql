ALTER TABLE "mitglied" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "mitglied" ADD CONSTRAINT "mitglied_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mitglied_verein_user_idx" ON "mitglied" USING btree ("verein_id","user_id") WHERE "mitglied"."user_id" is not null;
