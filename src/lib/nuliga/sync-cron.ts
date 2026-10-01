import { and, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { ligaMannschaften, ligaSpiele, ligaTeilnahmen, ligaVereine } from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import {
  STRUKTUR_INTERVALL_MINUTEN,
  spieleIntervallMinuten,
} from "./sync-hilfen";
import type { HoleJson } from "@/lib/handball-net/client";
import { synchronisiereHandballNet } from "@/lib/handball-net/sync";
import {
  synchronisiereSpiele,
  synchronisiereStruktur,
  type SyncOptionen,
} from "./sync";

const MINUTE_MS = 60_000;
const TAG_MS = 24 * 60 * MINUTE_MS;

function faellig(letzter: Date | null, intervallMinuten: number, jetzt: Date): boolean {
  return !letzter || jetzt.getTime() - letzter.getTime() >= intervallMinuten * MINUTE_MS;
}

// Hat der Verein ein Spiel gestern/heute/morgen? Dann ist er "spieltagsnah"
// und wird häufiger synchronisiert (Ergebnisse), sonst nur selten.
async function istSpieltagsnah(
  db: SyncOptionen["db"],
  ligaVereinId: string,
  jetzt: Date
): Promise<boolean> {
  const von = tagKey(new Date(jetzt.getTime() - TAG_MS));
  const bis = tagKey(new Date(jetzt.getTime() + TAG_MS));
  const treffer = await db
    .select({ id: ligaSpiele.id })
    .from(ligaSpiele)
    .innerJoin(
      ligaTeilnahmen,
      and(
        eq(ligaTeilnahmen.gruppeId, ligaSpiele.gruppeId),
        isNotNull(ligaTeilnahmen.nuligaTeamtableId),
        or(
          eq(ligaSpiele.heimTeamtableId, ligaTeilnahmen.nuligaTeamtableId),
          eq(ligaSpiele.gastTeamtableId, ligaTeilnahmen.nuligaTeamtableId)
        )
      )
    )
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .where(
      and(
        eq(ligaMannschaften.ligaVereinId, ligaVereinId),
        gte(ligaSpiele.datum, von),
        lte(ligaSpiele.datum, bis)
      )
    )
    .limit(1);
  return treffer.length > 0;
}

export type FaelligeErgebnis = {
  ligaVereinId: string;
  slug: string;
  struktur?: string;
  spiele?: string;
  handballNet?: string;
}[];

// Vom Cron aufgerufen (beliebig oft): entscheidet pro Verein, was fällig ist
// — Struktur ca. 1x täglich, Spiele spieltagsnah alle ~45 Min, sonst alle
// ~6 Std. `budgetMs` begrenzt die Laufzeit (Serverless-Timeout): bleibt
// etwas liegen, kommt es beim nächsten Aufruf dran.
export async function synchronisiereFaellige(
  opt: SyncOptionen & { budgetMs?: number; nurVereinId?: string; holeJson?: HoleJson }
): Promise<FaelligeErgebnis> {
  const { db, jetzt = new Date(), budgetMs = 45_000 } = opt;
  const start = Date.now();
  const vereine = await db.query.ligaVereine.findMany({
    where: opt.nurVereinId ? eq(ligaVereine.id, opt.nurVereinId) : sql`true`,
  });
  const ergebnis: FaelligeErgebnis = [];
  const frist = start + budgetMs;

  for (const v of vereine) {
    if (Date.now() - start > budgetMs) break;
    const eintrag: FaelligeErgebnis[number] = { ligaVereinId: v.id, slug: v.slug };
    // Jede Quelle für sich: ein Fehler/Ausfall einer Quelle betrifft die andere nicht.
    const spieltagsnah = await istSpieltagsnah(db, v.id, jetzt);
    const intervall = spieleIntervallMinuten(spieltagsnah);
    if (v.nuligaClubId) {
      try {
        if (faellig(v.strukturSynchronisiertAm, STRUKTUR_INTERVALL_MINUTEN, jetzt)) {
          eintrag.struktur = (await synchronisiereStruktur(v.id, { ...opt, jetzt, frist })).status;
        }
        if (
          eintrag.struktur !== "fehler" &&
          (eintrag.struktur !== undefined || faellig(v.spieleSynchronisiertAm, intervall, jetzt))
        ) {
          eintrag.spiele = (await synchronisiereSpiele(v.id, { ...opt, jetzt, frist })).status;
        }
      } catch (err) {
        eintrag.struktur = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    if (opt.holeJson && (v.handballNetClubId || v.handballNetTeamIds)) {
      try {
        if (faellig(v.handballNetSynchronisiertAm, intervall, jetzt)) {
          eintrag.handballNet = (
            await synchronisiereHandballNet(v.id, { db, holeJson: opt.holeJson, jetzt, frist })
          ).status;
        }
      } catch (err) {
        eintrag.handballNet = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    ergebnis.push(eintrag);
  }
  return ergebnis;
}
