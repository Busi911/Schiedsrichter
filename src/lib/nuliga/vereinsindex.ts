import { and, asc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { nuligaVereinsindex } from "@/db/schema";
import { parseVereinsuche } from "./parsers/vereinsuche";
import type { HoleHtml } from "./client";
import type { LigaDb } from "./sync";
import { baueNuligaUrl } from "./verbaende";

export type IndexErgebnis = {
  vereine: number;
  regionen: number;
  vollstaendig: boolean;
  warnungen: string[];
};

// Lädt die Vereinssuche des Verbands (Startseite -> je Bezirk eine Seite) und schreibt alle Vereine in
// den Index (Upsert über Verband + interne club-ID). Strikt sequenziell über den Client (Mindestabstand),
// mit Frist: reicht sie nicht, bleibt der Rest für den nächsten Lauf (alte Einträge werden nur nach einem
// VOLLSTÄNDIGEN Lauf entfernt, ein Teillauf löscht nie etwas).
export async function aktualisiereVereinsindex(opt: {
  db: LigaDb;
  holeHtml: HoleHtml;
  verband?: string;
  frist?: number;
  jetzt?: Date;
}): Promise<IndexErgebnis> {
  const verband = opt.verband ?? "HHV";
  const jetzt = opt.jetzt ?? new Date();
  const warnungen: string[] = [];
  let vereine = 0;

  const schreibe = async (eintraege: { clubId: string; name: string; nummer: string | null; bezirk: string | null }[]) => {
    if (eintraege.length === 0) return;
    await opt.db
      .insert(nuligaVereinsindex)
      .values(eintraege.map((e) => ({ ...e, verband, aktualisiertAm: jetzt })))
      .onConflictDoUpdate({
        target: [nuligaVereinsindex.verband, nuligaVereinsindex.clubId],
        set: {
          name: sql`excluded.name`,
          nummer: sql`excluded.nummer`,
          bezirk: sql`excluded.bezirk`,
          aktualisiertAm: sql`excluded.aktualisiert_am`,
        },
      });
    vereine += eintraege.length;
  };

  const startUrl = baueNuligaUrl(verband, "clubSearch", { federation: verband });
  const start = parseVereinsuche(await opt.holeHtml(startUrl));
  warnungen.push(...start.warnungen);
  await schreibe(start.daten.vereine);

  let vollstaendig = true;
  let geladen = 0;
  for (const region of start.daten.regionen) {
    if (opt.frist && Date.now() > opt.frist) {
      vollstaendig = false;
      break;
    }
    try {
      const params: Record<string, string> = { federation: verband, federations: verband, regionName: region.name };
      if (region.searchPattern) params.searchPattern = region.searchPattern;
      const seite = parseVereinsuche(await opt.holeHtml(baueNuligaUrl(verband, "clubSearch", params)), region.name);
      if (seite.daten.vereine.length === 0) warnungen.push(`Bezirk "${region.name}": keine Vereine gefunden`);
      await schreibe(seite.daten.vereine);
      geladen++;
    } catch (err) {
      vollstaendig = false;
      warnungen.push(`Bezirk "${region.name}" nicht lesbar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Ohne Bezirke (Struktur unklar) ist der Lauf nie "vollständig" im Sinne des Aufräumens.
  if (start.daten.regionen.length === 0) vollstaendig = false;

  if (vollstaendig) {
    await opt.db
      .delete(nuligaVereinsindex)
      .where(and(eq(nuligaVereinsindex.verband, verband), lt(nuligaVereinsindex.aktualisiertAm, jetzt)));
  }
  return { vereine, regionen: geladen, vollstaendig, warnungen };
}

const escapeLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

// Teiltreffer ohne Beachtung der Groß-/Kleinschreibung auf Name, oder genau die sichtbare Vereinsnummer.
export async function sucheVereinsindex(db: LigaDb, suche: string, opt: { verband?: string; limit?: number } = {}) {
  const q = suche.trim();
  if (q.length < 2) return [];
  return db
    .select()
    .from(nuligaVereinsindex)
    .where(
      and(
        eq(nuligaVereinsindex.verband, opt.verband ?? "HHV"),
        or(ilike(nuligaVereinsindex.name, `%${escapeLike(q)}%`), eq(nuligaVereinsindex.nummer, q))
      )
    )
    .orderBy(asc(nuligaVereinsindex.name))
    .limit(opt.limit ?? 20);
}
