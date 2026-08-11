CREATE TABLE "zuschussart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verein_id" uuid NOT NULL,
	"bezeichnung" text NOT NULL,
	"satz" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verein" ADD COLUMN "zuschuesse_aktiviert" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "zuschuss" ADD COLUMN "zuschussart_id" uuid;--> statement-breakpoint
ALTER TABLE "zuschussart" ADD CONSTRAINT "zuschussart_verein_id_verein_id_fk" FOREIGN KEY ("verein_id") REFERENCES "public"."verein"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zuschuss" ADD CONSTRAINT "zuschuss_zuschussart_id_zuschussart_id_fk" FOREIGN KEY ("zuschussart_id") REFERENCES "public"."zuschussart"("id") ON DELETE set null ON UPDATE no action;