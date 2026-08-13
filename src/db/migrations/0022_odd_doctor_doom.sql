ALTER TYPE "public"."zuordnung_quelle" ADD VALUE 'selbst_eingetragen_oeffentlich';--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD COLUMN "match_vorschlag_user_id" text;--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zeitnehmer_selbstanmeldung_token" text;--> statement-breakpoint
ALTER TABLE "termin_zuordnung" ADD CONSTRAINT "termin_zuordnung_match_vorschlag_user_id_user_id_fk" FOREIGN KEY ("match_vorschlag_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verein" ADD CONSTRAINT "verein_zeitnehmer_selbstanmeldung_token_unique" UNIQUE("zeitnehmer_selbstanmeldung_token");