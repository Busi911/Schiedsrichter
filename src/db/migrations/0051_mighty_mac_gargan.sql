-- Bestehende Freitext-Adressen nicht kommentarlos verwerfen: komplett nach
-- "strasse" übernehmen (lässt sich nicht automatisch in Straße/PLZ/Ort
-- auftrennen, da das alte Feld freien Text ohne festes Format war) — der
-- Admin kann das unter /admin/einstellungen manuell in die drei neuen Felder
-- aufteilen.
UPDATE "verein" SET "strasse" = "adresse" WHERE "adresse" IS NOT NULL AND "strasse" IS NULL;--> statement-breakpoint
ALTER TABLE "verein" DROP COLUMN "adresse";