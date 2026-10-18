import { and, desc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, mitgliedMannschaften, mitglieder } from "@/db/schema";
import { pruefeZuordnung, type MannschaftRolle, type ZuordnungEingabe } from "@/lib/mitglied-mannschaften";

export type VereinsMannschaft = { id: string; name: string; altersklasse: string | null };

/** Die aktiven öffentlichen Liga-Mannschaften DIESES Vereins (liga_* hat keine RLS: der Vereinsfilter steht ausdrücklich in der Abfrage). */
export async function ladeVereinsMannschaften(vereinId: string): Promise<VereinsMannschaft[]> {
  const zeilen = await adminDb
    .select({ id: ligaMannschaften.id, name: ligaMannschaften.name, eigen: ligaMannschaften.anzeigenameEigen, altersklasse: ligaMannschaften.altersklasse })
    .from(ligaMannschaften)
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaMannschaften.ligaVereinId))
    .where(and(eq(ligaVereine.vereinId, vereinId), eq(ligaMannschaften.aktiv, true)));
  return zeilen
    .map((z) => ({ id: z.id, name: z.eigen?.trim() || z.name, altersklasse: z.altersklasse }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export type ZuordnungZeile = { id: string; mitgliedId: string; mannschaftId: string; saison: string; rolle: MannschaftRolle };

export async function ladeZuordnungen(vereinId: string): Promise<ZuordnungZeile[]> {
  return withTenant(vereinId, (tx) =>
    tx
      .select({ id: mitgliedMannschaften.id, mitgliedId: mitgliedMannschaften.mitgliedId, mannschaftId: mitgliedMannschaften.mannschaftId, saison: mitgliedMannschaften.saison, rolle: mitgliedMannschaften.rolle })
      .from(mitgliedMannschaften)
      .innerJoin(mitglieder, eq(mitglieder.id, mitgliedMannschaften.mitgliedId))
      .where(eq(mitglieder.vereinId, vereinId))
      .orderBy(desc(mitgliedMannschaften.saison))
  );
}

/**
 * Ordnet ein Mitglied einer Mannschaft zu. Die Policy von mitglied_mannschaft prüft nur das Mitglied; die Mannschaft (liga_mannschaft, ohne RLS)
 * muss deshalb hier ausdrücklich zu diesem Verein gehören, sonst könnte ein manipuliertes Formular fremde Mannschaften eintragen.
 * Doppelte (gleiches Mitglied, gleiche Mannschaft, gleiche Saison) werden still ignoriert.
 */
export async function ordneZu(vereinId: string, eingabe: ZuordnungEingabe): Promise<{ ok: true } | { fehler: string }> {
  const gepruefte = pruefeZuordnung(eingabe);
  if ("fehler" in gepruefte) return gepruefte;
  const w = gepruefte.wert;
  const eigene = await ladeVereinsMannschaften(vereinId);
  if (!eigene.some((m) => m.id === w.mannschaftId)) return { fehler: "Diese Mannschaft gehört nicht zu eurem Verein." };
  return withTenant(vereinId, async (tx) => {
    const mitglied = await tx.query.mitglieder.findFirst({ where: and(eq(mitglieder.id, w.mitgliedId), eq(mitglieder.vereinId, vereinId)), columns: { id: true } });
    if (!mitglied) return { fehler: "Mitglied nicht gefunden." };
    await tx.insert(mitgliedMannschaften).values(w).onConflictDoNothing();
    return { ok: true as const };
  });
}

export async function entferneZuordnung(vereinId: string, zuordnungId: string): Promise<void> {
  await withTenant(vereinId, async (tx) => {
    const eigene = await tx
      .select({ id: mitgliedMannschaften.id })
      .from(mitgliedMannschaften)
      .innerJoin(mitglieder, eq(mitglieder.id, mitgliedMannschaften.mitgliedId))
      .where(and(eq(mitgliedMannschaften.id, zuordnungId), eq(mitglieder.vereinId, vereinId)));
    if (eigene.length > 0) await tx.delete(mitgliedMannschaften).where(eq(mitgliedMannschaften.id, zuordnungId));
  });
}
