import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { ligaMannschaften, ligaSpiele, ligaTeilnahmen, ligaVereine, mannschaften, termine } from "@/db/schema";
import { kategorieText } from "@/lib/hallenplan-abgleich";
import type { LigaDb } from "./sync";

export type MannschaftenErgebnis = {
  // "neu": der Verein hatte noch keine Mannschaft; "fortgesetzt": früher automatisch angelegt, neue Liga-Mannschaften kommen dazu;
  // "manuell": der Verein pflegt seine Mannschaften selbst — es wird NICHTS angelegt (keine Dubletten zu eigenen Namen).
  modus: "neu" | "fortgesetzt" | "manuell" | "ohne_liga";
  angelegt: number;
};

// Legt zu den Mannschaften, die der Liga-Sync für diesen Verein geladen hat (liga_mannschaft, aktiv), die Mannschaften des Vereins an
// (Tabelle mannschaft: Funktionsträger, Termine, Dienste). Namen aus der Liga-Anzeige (eigener Anzeigename vor Quellname), die
// Kategorie im selben Format wie der Hallenplan-Import ("Mä/männl.", "mJC" …). Jede angelegte Mannschaft trägt den Verweis auf ihre
// Liga-Mannschaft (exakte Zuordnung, nie über den Namen). Nie umbenennen, nie löschen, nie doppelt. Hat der Verein eigene,
// unverknüpfte Mannschaften, fasst diese Funktion nichts an.
export async function legeVereinsMannschaftenAn(db: LigaDb, vereinId: string): Promise<MannschaftenErgebnis> {
  const lv = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId), columns: { id: true } });
  if (!lv) return { modus: "ohne_liga", angelegt: 0 };

  const bestehende = await db.select({ id: mannschaften.id, ligaMannschaftId: mannschaften.ligaMannschaftId }).from(mannschaften).where(eq(mannschaften.vereinId, vereinId));
  const modus = bestehende.length === 0 ? "neu" : bestehende.some((m) => m.ligaMannschaftId) ? "fortgesetzt" : "manuell";
  if (modus === "manuell") return { modus, angelegt: 0 };

  const verknuepft = new Set(bestehende.map((m) => m.ligaMannschaftId).filter((x): x is string => !!x));
  const liga = await db.select().from(ligaMannschaften).where(and(eq(ligaMannschaften.ligaVereinId, lv.id), eq(ligaMannschaften.aktiv, true)));
  const neu = liga.filter((m) => !verknuepft.has(m.id));
  if (neu.length === 0) return { modus, angelegt: 0 };

  await db.insert(mannschaften).values(
    neu.map((m) => ({
      vereinId,
      name: m.anzeigenameEigen ?? m.name,
      altersklasse: kategorieText(m.geschlecht, m.altersklasse),
      ligaMannschaftId: m.id,
    }))
  );
  return { modus, angelegt: neu.length };
}

export type MannschaftsAufloeser = (spiel: { gruppeId: string; heimTeamtableId: string | null; gastTeamtableId: string | null }) => string | null;

// Ordnet ein Liga-Spiel exakt der Mannschaft des Vereins zu: Teamtable-ID des Spiels + Gruppe -> Teilnahme -> Liga-Mannschaft ->
// verknüpfte Vereins-Mannschaft. Die Heimmannschaft zuerst (Heimspiele in eigener Halle). null, wenn keine verknüpfte Mannschaft passt.
export async function baueMannschaftsAufloeser(db: LigaDb, vereinId: string): Promise<MannschaftsAufloeser> {
  const lv = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.vereinId, vereinId), columns: { id: true } });
  if (!lv) return () => null;
  const verknuepft = await db
    .select({ id: mannschaften.id, liga: mannschaften.ligaMannschaftId })
    .from(mannschaften)
    .where(and(eq(mannschaften.vereinId, vereinId), isNotNull(mannschaften.ligaMannschaftId)));
  const proLiga = new Map(verknuepft.map((m) => [m.liga!, m.id]));
  if (proLiga.size === 0) return () => null;
  const teilnahmen = await db
    .select({ gruppeId: ligaTeilnahmen.gruppeId, teamtable: ligaTeilnahmen.nuligaTeamtableId, liga: ligaTeilnahmen.mannschaftId })
    .from(ligaTeilnahmen)
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .where(eq(ligaMannschaften.ligaVereinId, lv.id));
  const schluessel = new Map<string, string>();
  for (const t of teilnahmen) {
    const m = t.teamtable ? proLiga.get(t.liga) : undefined;
    if (m) schluessel.set(`${t.gruppeId}:${t.teamtable}`, m);
  }
  return (s) =>
    (s.heimTeamtableId && schluessel.get(`${s.gruppeId}:${s.heimTeamtableId}`)) ||
    (s.gastTeamtableId && schluessel.get(`${s.gruppeId}:${s.gastTeamtableId}`)) ||
    null;
}

// Bereits angelegte Termine aus Liga-Spielen (liga_spiel_id gesetzt) ohne Mannschaft nachträglich zuordnen. Setzt nur leere
// mannschaft_id, ändert nie eine bestehende Zuordnung.
export async function verknuepfeTermineMitMannschaften(db: LigaDb, vereinId: string): Promise<number> {
  const aufloeser = await baueMannschaftsAufloeser(db, vereinId);
  const offen = await db
    .select({ id: termine.id, gruppeId: ligaSpiele.gruppeId, heim: ligaSpiele.heimTeamtableId, gast: ligaSpiele.gastTeamtableId })
    .from(termine)
    .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
    .where(and(eq(termine.vereinId, vereinId), isNull(termine.mannschaftId)));
  let n = 0;
  for (const t of offen) {
    const m = aufloeser({ gruppeId: t.gruppeId, heimTeamtableId: t.heim, gastTeamtableId: t.gast });
    if (!m) continue;
    await db.update(termine).set({ mannschaftId: m }).where(and(eq(termine.id, t.id), isNull(termine.mannschaftId)));
    n++;
  }
  return n;
}
