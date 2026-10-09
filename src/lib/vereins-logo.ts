import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine, ligaVereinLogos } from "@/db/schema";

// Das Logo des eigenen Vereins für die Kopfzeilen der eingeloggten Bereiche und der Selbsteintragung: nur, wenn es einen öffentlichen
// Vereinseintrag MIT Logo gibt (Upload oder nuLiga), sonst null — dann bleibt das HandballerPate-Logo stehen. Ausgeliefert wird es über die
// vorhandene Route /verein/[slug]/logo (die Version ist der Cache-Buster); ein Fehler beim Laden ist unkritisch, die Komponente fällt zurück.
export type VereinsLogoInfo = { slug: string; version: number; name: string };

export async function holeVereinsLogoInfo(vereinId: string | null | undefined): Promise<VereinsLogoInfo | null> {
  if (!vereinId) return null;
  try {
    const [zeile] = await adminDb
      .select({ slug: ligaVereine.slug, name: ligaVereine.name, version: ligaVereinLogos.aktualisiertAm })
      .from(ligaVereine)
      .innerJoin(ligaVereinLogos, eq(ligaVereinLogos.ligaVereinId, ligaVereine.id))
      .where(eq(ligaVereine.vereinId, vereinId))
      .limit(1);
    return zeile ? { slug: zeile.slug, name: zeile.name, version: zeile.version.getTime() } : null;
  } catch {
    return null; // Kopfzeile darf nie an einem Logo scheitern
  }
}
