DROP INDEX "liga_externe_identitaet_sportde_idx";--> statement-breakpoint
-- Die Quelle sport.de (HTTP 403) wurde nie genutzt und durch ndr.de ersetzt: eventuelle Reste entfernen.
DELETE FROM "liga_externe_identitaet" WHERE "quelle" = 'sportde';--> statement-breakpoint
DELETE FROM "liga_quelle_abruf" WHERE "quelle" = 'sportde';--> statement-breakpoint
DELETE FROM "liga_gruppe" WHERE "quelle" = 'sportde';
