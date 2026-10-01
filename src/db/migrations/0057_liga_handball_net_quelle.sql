ALTER TABLE "liga_spiel" ALTER COLUMN "spielnummer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_verein" ALTER COLUMN "nuliga_club_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_gruppe" ADD COLUMN "quelle" text DEFAULT 'nuliga' NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD COLUMN "spielcode" text;--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD COLUMN "quelle" text DEFAULT 'nuliga' NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_spiel" ADD COLUMN "externe_id" text;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD COLUMN "handball_net_club_id" text;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD COLUMN "handball_net_team_ids" text;--> statement-breakpoint
ALTER TABLE "liga_verein" ADD COLUMN "handball_net_synchronisiert_am" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_spiel_gruppe_code_idx" ON "liga_spiel" USING btree ("gruppe_id","spielcode");--> statement-breakpoint
CREATE UNIQUE INDEX "liga_verein_handball_net_club_idx" ON "liga_verein" USING btree ("handball_net_club_id");