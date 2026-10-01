CREATE TABLE "liga_verein_logo" (
	"liga_verein_id" uuid PRIMARY KEY NOT NULL,
	"png" "bytea" NOT NULL,
	"aktualisiert_am" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "liga_verein_logo" ADD CONSTRAINT "liga_verein_logo_liga_verein_id_liga_verein_id_fk" FOREIGN KEY ("liga_verein_id") REFERENCES "public"."liga_verein"("id") ON DELETE cascade ON UPDATE no action;