import { and, eq } from "drizzle-orm";
import { ligaExterneIdentitaeten, ligaVereine } from "@/db/schema";
import type { LigaDb } from "@/lib/nuliga/sync";

// Externe Identitäten eines Vereins über alle Quellen. nuLiga/handball.net liegen weiter an liga_verein
// (`nuliga_club_id`, `handball_net_club_id`), alle übrigen Quellen (derzeit HBL) in `liga_externe_identitaet`.
export type ExterneIdentitaet = { quelle: "nuliga" | "handball_net" | "hbl"; externeId: string; externerCode: string | null };

export async function holeIdentitaeten(db: LigaDb, ligaVereinId: string): Promise<ExterneIdentitaet[]> {
  const verein = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, ligaVereinId) });
  if (!verein) return [];
  const liste: ExterneIdentitaet[] = [];
  if (verein.nuligaClubId) liste.push({ quelle: "nuliga", externeId: verein.nuligaClubId, externerCode: null });
  if (verein.handballNetClubId) liste.push({ quelle: "handball_net", externeId: verein.handballNetClubId, externerCode: null });
  const weitere = await db.query.ligaExterneIdentitaeten.findMany({ where: eq(ligaExterneIdentitaeten.ligaVereinId, ligaVereinId) });
  for (const w of weitere) liste.push({ quelle: w.quelle as ExterneIdentitaet["quelle"], externeId: w.externeId, externerCode: w.externerCode });
  return liste;
}

// Ordnet ein HBL-Team (UUID) einem BESTEHENDEN Verein zu — legt nie einen Verein an. Ein Team gehört genau einem Verein;
// ist es schon einem anderen zugeordnet, wird nichts geändert und die Zuordnung gemeldet.
export async function verknuepfeHblTeam(
  db: LigaDb,
  ligaVereinId: string,
  team: { externalId: string; code?: string | null; name?: string | null }
): Promise<{ ok: true } | { ok: false; grund: string }> {
  const vorhanden = await db.query.ligaExterneIdentitaeten.findFirst({
    where: and(eq(ligaExterneIdentitaeten.quelle, "hbl"), eq(ligaExterneIdentitaeten.externeId, team.externalId)),
  });
  if (vorhanden && vorhanden.ligaVereinId !== ligaVereinId) {
    return { ok: false, grund: "Das HBL-Team ist bereits einem anderen Verein zugeordnet." };
  }
  if (!vorhanden) {
    await db.insert(ligaExterneIdentitaeten).values({
      ligaVereinId,
      quelle: "hbl",
      externeId: team.externalId,
      externerCode: team.code ?? null,
      name: team.name ?? null,
    });
  }
  return { ok: true };
}
