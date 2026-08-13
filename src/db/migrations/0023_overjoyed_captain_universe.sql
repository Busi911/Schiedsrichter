ALTER TABLE "termin" DROP CONSTRAINT "termin_ics_schiedsrichter_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "termin" ADD CONSTRAINT "termin_ics_schiedsrichter_id_user_id_fk" FOREIGN KEY ("ics_schiedsrichter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;