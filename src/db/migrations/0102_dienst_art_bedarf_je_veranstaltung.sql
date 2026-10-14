ALTER TABLE "dienst_art" ADD COLUMN "bedarf_heim" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dienst_art" ADD COLUMN "bedarf_auswaerts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dienst_art" ADD COLUMN "bedarf_freundschaft" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dienst_art" ADD COLUMN "bedarf_turnier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Bisherige Regel (Häkchen je Veranstaltung + ein Standardbedarf) in Zahlen je Veranstaltung übertragen.
UPDATE "dienst_art" SET
  "bedarf_heim" = CASE WHEN "fuer_heimspiele" THEN "standard_bedarf" ELSE 0 END,
  "bedarf_auswaerts" = CASE WHEN "fuer_auswaertsspiele" THEN "standard_bedarf" ELSE 0 END,
  "bedarf_freundschaft" = CASE WHEN "fuer_freundschaftsspiele" THEN "standard_bedarf" ELSE 0 END,
  "bedarf_turnier" = CASE WHEN "fuer_turniere" THEN "standard_bedarf" ELSE 0 END;
