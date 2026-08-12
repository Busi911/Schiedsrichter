ALTER TABLE "termin" ADD COLUMN "turnier_verantwortlicher_id" text;--> statement-breakpoint
ALTER TABLE "termin" ADD COLUMN "ergebnis_heim" integer;--> statement-breakpoint
ALTER TABLE "termin" ADD COLUMN "ergebnis_auswaerts" integer;--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_turnier_verantwortlicher_id_user_id_fk" FOREIGN KEY ("turnier_verantwortlicher_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;