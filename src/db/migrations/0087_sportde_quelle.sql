CREATE TABLE "liga_quelle_abruf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quelle" text NOT NULL,
	"schluessel" text NOT NULL,
	"letzter_versuch_am" timestamp,
	"letzter_erfolg_am" timestamp,
	"status" text,
	"letzter_fehler" text,
	"quell_url" text,
	"meta" jsonb
);
--> statement-breakpoint
DROP INDEX "liga_externe_identitaet_hbl_idx";--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD COLUMN "spieltag" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_quelle_abruf_quelle_schluessel_idx" ON "liga_quelle_abruf" USING btree ("quelle","schluessel");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_externe_identitaet_sportde_idx" ON "liga_externe_identitaet" USING btree ("quelle","externe_id") WHERE "liga_externe_identitaet"."quelle" = 'sportde';--> statement-breakpoint
-- Die frühere HBL-Quelle (opel-hbl.de) wurde nie befüllt (die Seiten liefern keine Daten im HTML) und durch sport.de ersetzt: Reste entfernen.
DELETE FROM "liga_externe_identitaet" WHERE "quelle" = 'hbl';--> statement-breakpoint
DELETE FROM "liga_gruppe" WHERE "quelle" = 'hbl';--> statement-breakpoint
-- Abruf-Status: nur die privilegierte Rolle (adminDb).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON TABLE "liga_quelle_abruf" FROM app_user;
  END IF;
END $$;
