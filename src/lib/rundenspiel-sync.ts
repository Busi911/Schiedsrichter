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
import { holeNuligaJson } from "./nuliga-scraper";

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
        await tx
          .update(termine)
          .set({
            start: ereignis.start,
            ort: ereignis.ort,
            beschreibung: ereignis.beschreibung,
            mannschaftId,
            heimMannschaftName: ereignis.heimMannschaft,
            auswaertsMannschaftName: ereignis.auswaertsMannschaft,
          })
          .where(eq(termine.id, bestehend.id));
        aktualisiert++;
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
    return { neu: 0, aktualisiert: 0, parseFehler: [], abrufFehler: [] };
  }

  const { json, fehler: abrufFehler } = await holeNuligaJson(hallenIds);
  const { ereignisse, fehler: parseFehler } = parseRundenspielJson(json);
  const { neu, aktualisiert } = await importiereRundenspielEreignisse(
    vereinId,
    ereignisse
  );

  return { neu, aktualisiert, parseFehler, abrufFehler };
}

// Läuft aus /api/cron/ics-sync mit, statt einen eigenen Vercel-Cron-Eintrag
// zu bekommen: der Hobby-Plan begrenzt Projekte auf zwei Cron Jobs
// insgesamt, unabhängig von der Ausführungshäufigkeit (siehe README) — ein
// dritter Eintrag lässt das Deployment fehlschlagen. Der Aufrufer entscheidet
// per Wochentags-Check, ob das an einem gegebenen Lauf überhaupt passieren
// soll (siehe ics-sync/route.ts); die Route selbst bleibt zusätzlich als
// eigener, manuell auslösbarer Endpunkt bestehen (siehe rundenspiel-sync/route.ts).
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
