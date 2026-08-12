import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { mannschaften, termine, vereine } from "@/db/schema";
import {
  findeMannschaft,
  parseRundenspielJson,
  type RundenspielEreignis,
} from "./rundenspiel-import";
import { holeNuligaJson, type NuligaDiagnose } from "./nuliga-scraper";

// DB-Import-Logik für bereits geparste Rundenspiel-Ereignisse — geteilt
// zwischen dem manuellen JSON-Upload (/admin/rundenspiele, siehe
// rundenspieleImportieren in admin/actions.ts) und dem automatischen
// nuLiga-Sync unten, damit beide Wege exakt dasselbe Update-/Dedup-
// Verhalten haben (Match über termin.ics_uid, siehe bildeUid in
// rundenspiel-import.ts).
export async function importiereRundenspielEreignisse(
  vereinId: string,
  ereignisse: RundenspielEreignis[]
) {
  let neu = 0;
  let aktualisiert = 0;

  await withTenant(vereinId, async (tx) => {
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
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
        // Nur EINE Zeile schreiben und als "aktualisiert" zählen, wenn sich
        // tatsächlich etwas geändert hat — sonst würde jeder Sync-Lauf (per
        // Cron mehrmals wöchentlich) jedes unveränderte Spiel erneut als
        // "aktualisiert" ausweisen, obwohl nichts passiert ist.
        const geaendert =
          bestehend.start.getTime() !== ereignis.start.getTime() ||
          bestehend.ort !== ereignis.ort ||
          bestehend.beschreibung !== ereignis.beschreibung ||
          bestehend.mannschaftId !== mannschaftId ||
          bestehend.heimMannschaftName !== ereignis.heimMannschaft ||
          bestehend.auswaertsMannschaftName !== ereignis.auswaertsMannschaft ||
          bestehend.kategorie !== ereignis.kategorie ||
          bestehend.pflichtspiel !== ereignis.pflichtspiel;

        if (geaendert) {
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
        });
        neu++;
      }
    }
  });

  return { neu, aktualisiert };
}

export type NuligaSyncErgebnis = {
  neu: number;
  aktualisiert: number;
  parseFehler: { index: number; grund: string }[];
  abrufFehler: { locationId: string; requestedMonth: string; grund: string }[];
  diagnose: NuligaDiagnose[];
};

// Automatischer End-to-End-Sync für einen Verein: nuLiga abrufen (bis zu
// drei Hallen-IDs, rollierendes 10-Monats-Fenster) + importieren. Wird sowohl
// vom Cron (/api/cron/rundenspiel-sync, alle Vereine mit aktiviertem
// Auto-Import) als auch direkt nach dem Speichern der Hallen-IDs in
// /admin/einstellungen aufgerufen (sofortiger erster Import statt Warten auf
// den nächsten Mo/Do-Lauf).
export async function synchronisiereNuligaHallen(
  vereinId: string,
  hallenIds: string[]
): Promise<NuligaSyncErgebnis> {
  if (hallenIds.length === 0) {
    return { neu: 0, aktualisiert: 0, parseFehler: [], abrufFehler: [], diagnose: [] };
  }

  const { json, fehler: abrufFehler, diagnose } = await holeNuligaJson(hallenIds);
  const { ereignisse, fehler: parseFehler } = parseRundenspielJson(json);
  const { neu, aktualisiert } = await importiereRundenspielEreignisse(
    vereinId,
    ereignisse
  );

  return { neu, aktualisiert, parseFehler, abrufFehler, diagnose };
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
