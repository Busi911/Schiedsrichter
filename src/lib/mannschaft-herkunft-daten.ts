import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaTeilnahmen } from "@/db/schema";
import type { MannschaftHerkunft } from "./mannschaft-herkunft";

/**
 * Liga/Saison/Quelle je interner Mannschaft (über `mannschaft.liga_mannschaft_id`): die neueste aktive Teilnahme, Freundschaftsspiel-Gruppen zählen nicht.
 * `liga_*` hat keine RLS (öffentliche Sportdaten); es werden nur die übergebenen Verweise abgefragt, die aus den eigenen Mannschaften des Vereins stammen.
 */
export async function ladeMannschaftsHerkunft(
  mannschaften: { id: string; ligaMannschaftId: string | null }[]
): Promise<Map<string, MannschaftHerkunft>> {
  const ligaIds = [...new Set(mannschaften.map((m) => m.ligaMannschaftId).filter((x): x is string => !!x))];
  const proLiga = new Map<string, MannschaftHerkunft>();
  if (ligaIds.length > 0) {
    const zeilen = await adminDb
      .select({ ligaMannschaftId: ligaTeilnahmen.mannschaftId, saison: ligaTeilnahmen.saison, liga: ligaGruppen.ligaName, quelle: ligaGruppen.quelle })
      .from(ligaTeilnahmen)
      .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
      .where(and(inArray(ligaTeilnahmen.mannschaftId, ligaIds), eq(ligaTeilnahmen.aktiv, true), eq(ligaGruppen.istFreundschaft, false)))
      .orderBy(desc(ligaTeilnahmen.saison));
    // Neueste Saison zuerst: die erste Zeile je Liga-Mannschaft gilt.
    for (const z of zeilen) if (!proLiga.has(z.ligaMannschaftId)) proLiga.set(z.ligaMannschaftId, { liga: z.liga, saison: z.saison, quelle: z.quelle });
  }
  const ergebnis = new Map<string, MannschaftHerkunft>();
  for (const m of mannschaften) {
    ergebnis.set(m.id, (m.ligaMannschaftId && proLiga.get(m.ligaMannschaftId)) || { liga: null, saison: null, quelle: null });
  }
  return ergebnis;
}
