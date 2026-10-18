import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { mitglieder, vereine } from "@/db/schema";

// Add-on Vereinsverwaltung eingeschaltet? Nur der Systemadmin schaltet es frei (/system/abrechnung). Aus = Seiten zeigen einen Hinweis, Actions lehnen ab.
export async function vereinsverwaltungAktiv(vereinId: string): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const v = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { vereinsverwaltungAktiv: true } });
    return !!v?.vereinsverwaltungAktiv;
  });
}

export type MitgliedZeile = typeof mitglieder.$inferSelect;

export async function ladeMitglieder(vereinId: string): Promise<MitgliedZeile[]> {
  return withTenant(vereinId, (tx) => tx.select().from(mitglieder).where(eq(mitglieder.vereinId, vereinId)));
}
