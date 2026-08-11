ALTER TYPE "public"."termin_typ" ADD VALUE 'turnier_spiel';--> statement-breakpoint
ALTER TABLE "termin" ADD COLUMN "turnier_id" uuid;--> statement-breakpoint
ALTER TABLE "termin" ADD COLUMN "freigabe_token" text;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_turnier_id_termin_id_fk" FOREIGN KEY ("turnier_id") REFERENCES "public"."termin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_freigabe_token_unique" UNIQUE("freigabe_token");