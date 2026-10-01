ALTER TABLE "liga_verein_zusatzquelle" ALTER COLUMN "nuliga_club_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "liga_verein_zusatzquelle" ADD COLUMN "handball_net_club_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "liga_zusatzquelle_verein_hnet_idx" ON "liga_verein_zusatzquelle" USING btree ("liga_verein_id","handball_net_club_id");