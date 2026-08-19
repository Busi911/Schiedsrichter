import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { mannschaften, termine, vereine } from "@/db/schema";
import {
  findeMannschaft,
  parseRundenspielJson,
  type RundenspielEreignis,
} from "./rundenspiel-import";
import { holeNuligaJson, type NuligaDiagnose } from "./nuliga-scraper";
import { sendeRundenspielAenderungenBenachrichtigung } from "./rundenspiel-benachrichtigung";

// DB-Import-Logik für bereits geparste Rundenspiel-Ereignisse — geteilt
// zwischen dem manuellen JSON-Upload (/admin/termine (Hallenspielplan-Tab), siehe
// rundenspieleImportieren in admin/actions.ts) und dem automatischen
// nuLiga-Sync unten, damit beide Wege exakt dasselbe Update-/Dedup-
// Verhalten haben (Match über termin.ics_uid, siehe bildeUid in
// rundenspiel-import.ts).
// Reiner Vergleich (ohne DB-Zugriff), damit er ohne Testdatenbank getestet
// werden kann — siehe rundenspiel-sync.test.ts. Entscheidet, ob ein bereits
// importiertes Rundenspiel ein UPDATE braucht: nur wenn sich tatsächlich
// etwas geändert hat, sonst würde jeder Sync-Lauf (per Cron täglich) jedes
// unveränderte Spiel erneut als "aktualisiert" ausweisen.
export function terminBenoetigtUpdate(
  bestehend: {
    start: Date;
    ort: string | null;
    beschreibung: string | null;
    mannschaftId: string | null;
    heimMannschaftName: string | null;
    auswaertsMannschaftName: string | null;
    kategorie: string | null;
    pflichtspiel: boolean | null;
    freundschaftsTyp: string | null;
    ergebnisHeim: number | null;
    ergebnisAuswaerts: number | null;
    nuligaSchiedsrichterKuerzel: string | null;
  },
  ereignis: RundenspielEreignis,
  mannschaftId: string | null
): boolean {
  return (
    bestehend.start.getTime() !== ereignis.start.getTime() ||
    bestehend.ort !== ereignis.ort ||
    bestehend.beschreibung !== ereignis.beschreibung ||
    bestehend.mannschaftId !== mannschaftId ||
    bestehend.heimMannschaftName !== ereignis.heimMannschaft ||
    bestehend.auswaertsMannschaftName !== ereignis.auswaertsMannschaft ||
    bestehend.kategorie !== ereignis.kategorie ||
    bestehend.pflichtspiel !== ereignis.pflichtspiel ||
    bestehend.freundschaftsTyp !== ereignis.freundschaftsTyp ||
    bestehend.ergebnisHeim !== ereignis.ergebnisHeim ||
    bestehend.ergebnisAuswaerts !== ereignis.ergebnisAuswaerts ||
    bestehend.nuligaSchiedsrichterKuerzel !== ereignis.schiedsrichterKuerzel
  );
}

// Ein bereits importiertes Rundenspiel, das sich beim Sync geändert hat UND
// für den Admin relevant ist (siehe Vereinsadmin-Opt-in in
// rundenspiel-benachrichtigung.ts) — bewusst nur die beiden vom Nutzer
// genannten Fälle "Spiel verlegt" (Zeit/Ort) und "Ergebnis neu eingetragen",
// nicht JEDE Änderung aus terminBenoetigtUpdate (z.B. eine korrigierte
// Mannschaftszuordnung wäre für eine Benachrichtigung zu viel Rauschen).
export type RundenspielAenderung = {
  terminId: string;
  start: Date;
  ort: string | null;
  heimMannschaft: string;
  auswaertsMannschaft: string;
  verlegt: boolean;
  ergebnisNeu: boolean;
};

// Reiner Vergleich (ohne DB-Zugriff, siehe rundenspiel-sync.test.ts) —
// separat von terminBenoetigtUpdate, da hier nur die zwei
// benachrichtigungsrelevanten Änderungsarten interessieren, nicht JEDES
// geänderte Feld. null = keine der beiden Änderungsarten liegt vor (z.B.
// nur ein korrigierter Vereinsname), dann lohnt kein Eintrag in
// RundenspielAenderung.
export function ermittleRundenspielAenderung(
  bestehend: { start: Date; ort: string | null; ergebnisHeim: number | null; ergebnisAuswaerts: number | null },
  ereignis: RundenspielEreignis
): { verlegt: boolean; ergebnisNeu: boolean } | null {
  const verlegt =
    bestehend.start.getTime() !== ereignis.start.getTime() || bestehend.ort !== ereignis.ort;
  const ergebnisNeu =
    (bestehend.ergebnisHeim === null || bestehend.ergebnisAuswaerts === null) &&
    ereignis.ergebnisHeim !== null &&
    ereignis.ergebnisAuswaerts !== null;
  return verlegt || ergebnisNeu ? { verlegt, ergebnisNeu } : null;
}

export async function importiereRundenspielEreignisse(
  vereinId: string,
  ereignisse: RundenspielEreignis[]
) {
  let neu = 0;
  let aktualisiert = 0;
  const aenderungen: RundenspielAenderung[] = [];

  await withTenant(vereinId, async (tx) => {
    // Explizite Sortierung, damit findeMannschaft bei mehreren Treffern
    // (siehe dort) deterministisch dasselbe Ergebnis liefert — ohne
    // orderBy garantiert Postgres keine stabile Zeilenreihenfolge über
    // wiederholte Abfragen hinweg.
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m) => [asc(m.name)],
    });

    for (const ereignis of ereignisse) {
      const mannschaftId = findeMannschaft(ereignis, mannschaftsListe);
      const bestehend = await tx.query.termine.findFirst({
        where: and(
          eq(termine.vereinId, vereinId),
          eq(termine.icsUid, ereignis.uid)
        ),
      });

      if (bestehend) {
        if (terminBenoetigtUpdate(bestehend, ereignis, mannschaftId)) {
          const aenderung = ermittleRundenspielAenderung(bestehend, ereignis);
          if (aenderung) {
            aenderungen.push({
              terminId: bestehend.id,
              start: ereignis.start,
              ort: ereignis.ort,
              heimMannschaft: ereignis.heimMannschaft,
              auswaertsMannschaft: ereignis.auswaertsMannschaft,
              ...aenderung,
            });
          }
          await tx
            .update(termine)
            .set({
              start: ereignis.start,
              ort: ereignis.ort,
              beschreibung: ereignis.beschreibung,
              mannschaftId,
              heimMannschaftName: ereignis.heimMannschaft,
              auswaertsMannschaftName: ereignis.auswaertsMannschaft,
              kategorie: ereignis.kategorie,
              pflichtspiel: ereignis.pflichtspiel,
              freundschaftsTyp: ereignis.freundschaftsTyp,
              ergebnisHeim: ereignis.ergebnisHeim,
              ergebnisAuswaerts: ereignis.ergebnisAuswaerts,
              nuligaSchiedsrichterKuerzel: ereignis.schiedsrichterKuerzel,
            })
            .where(eq(termine.id, bestehend.id));
          aktualisiert++;
        }
      } else {
        await tx.insert(termine).values({
          vereinId,
          typ: "rundenspiel",
          quelle: "rundenspiel_import",
          start: ereignis.start,
          ort: ereignis.ort,
          beschreibung: ereignis.beschreibung,
          mannschaftId,
          icsUid: ereignis.uid,
          heimMannschaftName: ereignis.heimMannschaft,
          auswaertsMannschaftName: ereignis.auswaertsMannschaft,
          kategorie: ereignis.kategorie,
          pflichtspiel: ereignis.pflichtspiel,
          freundschaftsTyp: ereignis.freundschaftsTyp,
          ergebnisHeim: ereignis.ergebnisHeim,
          ergebnisAuswaerts: ereignis.ergebnisAuswaerts,
          nuligaSchiedsrichterKuerzel: ereignis.schiedsrichterKuerzel,
        });
        neu++;
      }
    }
  });

  return { neu, aktualisiert, aenderungen };
}

export type NuligaSyncErgebnis = {
  neu: number;
  aktualisiert: number;
  aenderungen: RundenspielAenderung[];
  parseFehler: { index: number; grund: string }[];
  abrufFehler: { locationId: string; requestedMonth: string; grund: string }[];
  diagnose: NuligaDiagnose[];
};

// Automatischer End-to-End-Sync für einen Verein: nuLiga abrufen (bis zu
// drei Hallen-IDs, rollierendes 10-Monats-Fenster) + importieren. Wird sowohl
// vom Cron (/api/cron/rundenspiel-sync, alle Vereine mit aktiviertem
// Auto-Import) als auch direkt nach dem Speichern der Hallen-IDs in
// /admin/einstellungen aufgerufen (sofortiger erster Import statt Warten auf
// den nächsten täglichen Cron-Lauf).
export async function synchronisiereNuligaHallen(
  vereinId: string,
  hallenIds: string[]
): Promise<NuligaSyncErgebnis> {
  if (hallenIds.length === 0) {
    return {
      neu: 0,
      aktualisiert: 0,
      aenderungen: [],
      parseFehler: [],
      abrufFehler: [],
      diagnose: [],
    };
  }

  const { json, fehler: abrufFehler, diagnose } = await holeNuligaJson(hallenIds);
  const { ereignisse, fehler: parseFehler } = parseRundenspielJson(json);
  const { neu, aktualisiert, aenderungen } = await importiereRundenspielEreignisse(
    vereinId,
    ereignisse
  );

  return { neu, aktualisiert, aenderungen, parseFehler, abrufFehler, diagnose };
}

// Für alle Vereine mit aktiviertem Auto-Import (siehe /api/cron/rundenspiel-sync).
export async function synchronisiereAlleAktivenNuligaVereine() {
  const kandidaten = await adminDb.query.vereine.findMany({
    where: eq(vereine.nuligaAutoImportAktiviert, true),
  });

  const ergebnisse = [];
  for (const verein of kandidaten) {
    const hallenIds = [
      verein.nuligaHalle1Id,
      verein.nuligaHalle2Id,
      verein.nuligaHalle3Id,
    ].filter((id): id is string => id !== null);
    if (hallenIds.length === 0) continue;

    try {
      const ergebnis = await synchronisiereNuligaHallen(verein.id, hallenIds);
      ergebnisse.push({ vereinId: verein.id, status: "ok", ...ergebnis });

      // Best effort: ein Fehler beim Mailversand soll den bereits
      // erfolgreichen Sync nicht als "fehler" ausweisen (analog zum
      // Push-Kommentar in terminerinnerungen.ts).
      try {
        await sendeRundenspielAenderungenBenachrichtigung(verein, ergebnis.aenderungen);
      } catch {
        // ignoriert — der Sync selbst war bereits erfolgreich.
      }
    } catch (err) {
      ergebnisse.push({
        vereinId: verein.id,
        status: "fehler",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return ergebnisse;
}
