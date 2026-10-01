import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine } from "@/db/schema";
import { holeMannschaften } from "@/lib/liga-oeffentlich";
import { sammleVereinsSpiele } from "@/lib/liga-spiele-hilfen";

// Letzte Ergebnisse ALLER Mannschaften (Heim und Auswärts) aus den
// öffentlichen Liga-Daten für die Admin-Übersicht — der Hallenplan kennt nur
// Heimspiele in den eigenen Hallen. null = Verein hat keine öffentliche Seite.
export async function holeLigaErgebnisse(vereinId: string, limit: number) {
  const [lv] = await adminDb
    .select({ id: ligaVereine.id, slug: ligaVereine.slug })
    .from(ligaVereine)
    .where(eq(ligaVereine.vereinId, vereinId));
  if (!lv) return null;
  const mannschaften = await holeMannschaften(lv.id);
  const { ergebnisse } = sammleVereinsSpiele(mannschaften, new Date(), { ergebnisse: limit, anstehend: 0 });
  return { slug: lv.slug, ergebnisse };
}
