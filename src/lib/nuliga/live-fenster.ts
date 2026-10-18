import { and, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { ligaGruppen, ligaMannschaften, ligaSpiele, ligaTeilnahmen, ligaVereine, vereine } from "@/db/schema";
import { synchronisiereSpiele, type SyncOptionen } from "./sync";

// Live-Fenster rund um den Anwurf (Cron /api/cron/liga-live, alle 5 Minuten): nuLiga zeigt den Spielbericht-Link (und damit den
// Live-Ticker) oft erst kurz vor/nach dem Anwurf. Der stündliche Liga-Sync würde ihn bis zu eine Stunde zu spät holen. Hier werden
// deshalb NUR die Mannschaften geladen, die gerade ein Spiel im Fenster haben (meist eine Handvoll Abrufe je Lauf).
const MIN = 60_000;
// Link-Fenster: Spiel ohne Meeting-ID von 30 Min vor bis 60 Min nach dem Anwurf, höchstens alle 4 Minuten je Mannschaft.
export const LINK_VOR_MS = 30 * MIN;
export const LINK_NACH_MS = 60 * MIN;
export const LINK_ABSTAND_MS = 4 * MIN;
// Ergebnis-Fenster: 75 bis 180 Min nach dem Anwurf, Ergebnis noch nicht genehmigt (Endstand holen), höchstens alle 14 Minuten.
export const ERGEBNIS_AB_MS = 75 * MIN;
export const ERGEBNIS_BIS_MS = 180 * MIN;
export const ERGEBNIS_ABSTAND_MS = 14 * MIN;

export type LiveKandidat = {
  teilnahmeId: string;
  ligaVereinId: string;
  beginn: Date;
  meetingId: string | null;
  spieleSynchronisiertAm: Date | null;
};

function zuAlt(zeit: Date | null, abstandMs: number, jetzt: Date): boolean {
  return !zeit || jetzt.getTime() - zeit.getTime() >= abstandMs;
}

// Rein: welche Kandidaten jetzt geladen werden. Eine Teilnahme genügt einmal, auch bei mehreren Spielen.
export function waehleLiveTeilnahmen(kandidaten: LiveKandidat[], jetzt: Date): LiveKandidat[] {
  const gewaehlt = new Map<string, LiveKandidat>();
  for (const k of kandidaten) {
    const seit = jetzt.getTime() - k.beginn.getTime(); // > 0: Anwurf liegt zurück
    const linkFehlt = !k.meetingId && seit >= -LINK_VOR_MS && seit <= LINK_NACH_MS;
    const endstand = seit >= ERGEBNIS_AB_MS && seit <= ERGEBNIS_BIS_MS;
    const dran =
      (linkFehlt && zuAlt(k.spieleSynchronisiertAm, LINK_ABSTAND_MS, jetzt)) ||
      (endstand && zuAlt(k.spieleSynchronisiertAm, ERGEBNIS_ABSTAND_MS, jetzt));
    if (dran && !gewaehlt.has(k.teilnahmeId)) gewaehlt.set(k.teilnahmeId, k);
  }
  return [...gewaehlt.values()];
}

export async function holeLiveKandidaten(db: SyncOptionen["db"], jetzt: Date): Promise<LiveKandidat[]> {
  const von = new Date(jetzt.getTime() - ERGEBNIS_BIS_MS);
  const bis = new Date(jetzt.getTime() + LINK_VOR_MS);
  const zeilen = await db
    .select({
      teilnahmeId: ligaTeilnahmen.id,
      ligaVereinId: ligaMannschaften.ligaVereinId,
      beginn: ligaSpiele.beginn,
      meetingId: ligaSpiele.meetingId,
      spieleSynchronisiertAm: ligaTeilnahmen.spieleSynchronisiertAm,
    })
    .from(ligaSpiele)
    .innerJoin(
      ligaTeilnahmen,
      and(
        eq(ligaTeilnahmen.gruppeId, ligaSpiele.gruppeId),
        eq(ligaTeilnahmen.aktiv, true),
        isNotNull(ligaTeilnahmen.nuligaTeamtableId),
        or(
          eq(ligaSpiele.heimTeamtableId, ligaTeilnahmen.nuligaTeamtableId),
          eq(ligaSpiele.gastTeamtableId, ligaTeilnahmen.nuligaTeamtableId)
        )
      )
    )
    .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaSpiele.gruppeId))
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaMannschaften.ligaVereinId))
    .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
    .where(
      and(
        eq(ligaGruppen.quelle, "nuliga"),
        eq(ligaGruppen.istMeldeliste, false),
        eq(ligaGruppen.istFreundschaft, false),
        isNotNull(ligaVereine.nuligaClubId),
        eq(vereine.status, "aktiv"),
        eq(ligaMannschaften.aktiv, true),
        inArray(ligaSpiele.status, ["geplant", "verlegt"]), // verlegt: neuer Termin gespeichert, nuLiga lässt das "v" stehen
        eq(ligaSpiele.ergebnisBestaetigt, false),
        gte(ligaSpiele.beginn, von),
        lte(ligaSpiele.beginn, bis)
      )
    );
  return zeilen.flatMap((z) => (z.beginn ? [{ ...z, beginn: z.beginn }] : []));
}

export type LiveFensterErgebnis = {
  mannschaften: number;
  vereine: { ligaVereinId: string; mannschaften: number; status: string; anfragen: number }[];
};

export async function synchronisiereLiveFenster(
  opt: Pick<SyncOptionen, "db" | "holeHtml"> & { jetzt?: Date; frist?: number }
): Promise<LiveFensterErgebnis> {
  const jetzt = opt.jetzt ?? new Date();
  const dran = waehleLiveTeilnahmen(await holeLiveKandidaten(opt.db, jetzt), jetzt);
  const jeVerein = new Map<string, string[]>();
  for (const k of dran) jeVerein.set(k.ligaVereinId, [...(jeVerein.get(k.ligaVereinId) ?? []), k.teilnahmeId]);

  const ergebnis: LiveFensterErgebnis = { mannschaften: dran.length, vereine: [] };
  for (const [ligaVereinId, ids] of jeVerein) {
    if (opt.frist !== undefined && Date.now() > opt.frist) break;
    const r = await synchronisiereSpiele(ligaVereinId, {
      db: opt.db,
      holeHtml: opt.holeHtml,
      jetzt,
      frist: opt.frist,
      erzwingen: true,
      nurTeilnahmeIds: ids,
    });
    ergebnis.vereine.push({ ligaVereinId, mannschaften: ids.length, status: r.status, anfragen: r.anfragen });
  }
  return ergebnis;
}
