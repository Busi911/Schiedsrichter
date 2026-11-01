import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaQuellenAbrufe, ligaVereine, vereine } from "@/db/schema";
import { holeHandballNetApi } from "@/lib/handball-net/client";
import { holeNuligaHtml } from "@/lib/nuliga/client";
import { pruefeAlleQuellen, schreibeStandFort, type QuellenPruefung } from "@/lib/quellen-test";
import { holeNdrSeite } from "@/lib/sources/ndr/client";
import type { TestStand } from "@/lib/sync-ueberwachung";

const QUELLE = "quellentest";

/** Letzter bekannter Stand aller Prüfungen (für die Überwachung und die Anzeige). */
export async function ladeTestStaende(): Promise<(TestStand & { detail: string | null; dauerMs: number | null })[]> {
  const zeilen = await adminDb.select().from(ligaQuellenAbrufe).where(eq(ligaQuellenAbrufe.quelle, QUELLE));
  return zeilen.map((z) => {
    const meta = (z.meta ?? {}) as { fehlerInFolge?: number; detail?: string; dauerMs?: number };
    return { schluessel: z.schluessel, letzterVersuchAm: z.letzterVersuchAm, letzterErfolgAm: z.letzterErfolgAm, fehlerInFolge: meta.fehlerInFolge ?? 0, letzterFehler: z.letzterFehler, detail: meta.detail ?? null, dauerMs: meta.dauerMs ?? null };
  });
}

// Testverein: ein aktiver Verein (ohne Demo) mit der jeweiligen Quelle, der zuletzt erfolgreich synchronisiert wurde — so testen wir
// gegen echte, nachweislich einmal funktionierende IDs und nicht gegen eine geratene.
async function waehleTestIds(): Promise<{ handballNetClubId: string | null; nuligaClubId: string | null }> {
  const [hnet] = await adminDb
    .select({ id: ligaVereine.handballNetClubId })
    .from(ligaVereine)
    .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
    .where(and(eq(vereine.status, "aktiv"), eq(vereine.istDemo, false), isNotNull(ligaVereine.handballNetClubId)))
    .orderBy(desc(ligaVereine.handballNetSynchronisiertAm))
    .limit(1);
  const [nu] = await adminDb
    .select({ id: ligaVereine.nuligaClubId })
    .from(ligaVereine)
    .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
    .where(and(eq(vereine.status, "aktiv"), eq(vereine.istDemo, false), isNotNull(ligaVereine.nuligaClubId)))
    .orderBy(desc(ligaVereine.spieleSynchronisiertAm))
    .limit(1);
  return { handballNetClubId: hnet?.id ?? null, nuligaClubId: nu?.id ?? null };
}

/** Führt den Test gegen die echten Quellen aus und speichert das Ergebnis (außer `nurAnzeigen`). */
export async function fuehreQuellenTestAus(opt: { jetzt?: Date; nurAnzeigen?: boolean } = {}): Promise<QuellenPruefung[]> {
  const jetzt = opt.jetzt ?? new Date();
  const ids = await waehleTestIds();
  const ergebnis = await pruefeAlleQuellen({ jetzt, holeJson: holeHandballNetApi, holeHtml: holeNuligaHtml, holeNdr: holeNdrSeite, ...ids });
  if (opt.nurAnzeigen) return ergebnis;
  const alt = new Map((await ladeTestStaende()).map((s) => [s.schluessel, s]));
  for (const p of ergebnis) {
    const neu = schreibeStandFort(alt.get(p.schluessel), p, jetzt);
    if (!neu) continue;
    const werte = { letzterVersuchAm: neu.letzterVersuchAm, letzterErfolgAm: neu.letzterErfolgAm, status: p.ok ? "ok" : "fehler", letzterFehler: neu.letzterFehler, meta: { fehlerInFolge: neu.fehlerInFolge, detail: p.detail, dauerMs: p.dauerMs } };
    await adminDb
      .insert(ligaQuellenAbrufe)
      .values({ quelle: QUELLE, schluessel: p.schluessel, ...werte })
      .onConflictDoUpdate({ target: [ligaQuellenAbrufe.quelle, ligaQuellenAbrufe.schluessel], set: werte });
  }
  return ergebnis;
}
