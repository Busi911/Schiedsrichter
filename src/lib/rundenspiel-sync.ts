import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
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
import { sendeDuplikatBenachrichtigungen } from "./duplikat-benachrichtigung";

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
    handballNetSchiedsrichter: string | null;
    handballNetZeitnehmer: string | null;
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
    bestehend.nuligaSchiedsrichterKuerzel !== ereignis.schiedsrichterKuerzel ||
    bestehend.handballNetSchiedsrichter !== ereignis.angesetzterSchiedsrichter ||
    bestehend.handballNetZeitnehmer !== ereignis.angesetzterZeitnehmer
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
  ereignisse: RundenspielEreignis[],
  // Default: namensbasierte Heuristik wie bisher (nuLiga-Teamnamen sind kurz
  // und uneindeutig, z.B. "Herren 1"). Der handball.net-Sync (siehe
  // handball-net-sync.ts) kennt die Mannschaft dagegen schon exakt über die
  // vom Admin gepflegte Team-ID und übergibt hier einen präziseren
  // Resolver — die volle handball.net-Teambezeichnung (kompletter
  // Vereinsname statt "Herren 1") würde bei findeMannschaft sonst meist gar
  // nicht matchen.
  mannschaftIdErmitteln: (
    ereignis: RundenspielEreignis,
    mannschaftsListe: { id: string; name: string; altersklasse?: string | null }[]
  ) => string | null = findeMannschaft
) {
  let neu = 0;
  let aktualisiert = 0;
  const aenderungen: RundenspielAenderung[] = [];
  // ALLE verarbeiteten Termine (nicht nur neue/aktualisierte) — Basis für
  // ordneHandballNetBesetzungZu (handball-net-zuordnung.ts), das auch bei
  // einem unveränderten Termin erneut versuchen soll zu matchen (z.B. wenn
  // der passende Funktionsträger erst NACH dem letzten Sync angelegt
  // wurde).
  const terminIds: string[] = [];

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
      const mannschaftId = mannschaftIdErmitteln(ereignis, mannschaftsListe);
      const bestehend = await tx.query.termine.findFirst({
        where: and(
          eq(termine.vereinId, vereinId),
          eq(termine.icsUid, ereignis.uid)
        ),
      });

      if (bestehend) {
        terminIds.push(bestehend.id);
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
              handballNetSchiedsrichter: ereignis.angesetzterSchiedsrichter,
              handballNetZeitnehmer: ereignis.angesetzterZeitnehmer,
            })
            .where(eq(termine.id, bestehend.id));
          aktualisiert++;
        }
      } else {
        const [eingefuegt] = await tx
          .insert(termine)
          .values({
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
            handballNetSchiedsrichter: ereignis.angesetzterSchiedsrichter,
            handballNetZeitnehmer: ereignis.angesetzterZeitnehmer,
          })
          .returning({ id: termine.id });
        terminIds.push(eingefuegt.id);
        neu++;
      }
    }
  });

  return { neu, aktualisiert, aenderungen, terminIds };
}

// locationId steckt als erstes Segment in der UID (siehe bildeUid in
// rundenspiel-import.ts: "rundenspiel:{locationId}:..."), sowohl bei nuLiga
// (Hallen-ID) als auch bei handball.net (Team-ID) — beide Quellen teilen sich
// denselben Namensraum ohne Quellen-Präfix. Träfe eine nuLiga-Hallen-ID
// zufällig numerisch auf eine handball.net-Team-ID desselben Vereins, könnte
// der jeweils andere Sync-Lauf dessen Termine fälschlich als verwaist
// entfernen — praktisch sehr unwahrscheinlich (zwei unabhängige externe
// ID-Räume) und selbstheilend (der betroffene Sync legt sie beim nächsten
// Lauf einfach neu an), daher hier bewusst kein Quellen-Tag in der UID
// ergänzt (würde sonst bestehende UIDs aller bereits importierten Termine
// brechen).
function locationIdAusUid(uid: string): string | null {
  return uid.match(/^rundenspiel:([^:]+):/)?.[1] ?? null;
}

// Reiner Vergleich (ohne DB-Zugriff, siehe rundenspiel-sync.test.ts):
// bereits importierte Rundenspiele einer aktuell synchronisierten Halle/
// Mannschaft, die im frisch geparsten Feed nicht mehr auftauchen — z.B. weil
// nuLiga die Zeile nachträglich mit "x" als durch ein anderes Spiel ersetzt
// markiert hat (das Spiel bleibt dabei bei nuLiga selbst sichtbar
// stehen, "ausgext", nur ohne gültige Uhrzeit-Zelle mehr, siehe
// nuliga-scraper.ts) — der frische Feed ist für die synchronisierten
// locationIds die vollständige, aktuelle Wahrheit, ein Fehlen dort bedeutet
// also "nicht mehr gültig". Nur Termine EINER der aktuell synchronisierten
// locationIds betroffen — ein Termin einer nicht mehr konfigurierten Halle/
// Mannschaft (z.B. nach Entfernen der Hallen-ID) bleibt unangetastet, dafür
// müsste sie ja gerade NICHT mehr Teil dieses Sync-Laufs sein.
export function ermittleVerwaisteRundenspielIds(
  bestehende: { id: string; icsUid: string | null }[],
  locationIds: string[],
  aktuelleUids: Set<string>
): string[] {
  const locationIdSet = new Set(locationIds);
  return bestehende
    .filter((t) => {
      if (!t.icsUid) return false;
      const locationId = locationIdAusUid(t.icsUid);
      return locationId !== null && locationIdSet.has(locationId) && !aktuelleUids.has(t.icsUid);
    })
    .map((t) => t.id);
}

// Löscht die von ermittleVerwaisteRundenspielIds gefundenen Termine. Nur
// ZUKÜNFTIGE Termine (start >= jetzt): vergangene, bereits gespielte Termine
// bleiben unangetastet, selbst wenn ihre Halle/Mannschaft aktuell
// synchronisiert wird — die History soll dadurch nicht rückwirkend
// verschwinden. Cascade-Löschung (siehe termin_zuordnung/benachrichtigung in
// db/schema.ts) entfernt dabei automatisch auch bereits zugeordnete
// Schiedsrichter/Zeitnehmer und offene Benachrichtigungen für diesen Termin.
export async function entferneVerwaisteRundenspiele(
  vereinId: string,
  locationIds: string[],
  aktuelleUids: Set<string>,
  jetzt = new Date()
): Promise<number> {
  if (locationIds.length === 0) return 0;

  return withTenant(vereinId, async (tx) => {
    const kandidaten = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        eq(termine.typ, "rundenspiel"),
        eq(termine.quelle, "rundenspiel_import"),
        gte(termine.start, jetzt)
      ),
      columns: { id: true, icsUid: true },
    });

    const verwaisteIds = ermittleVerwaisteRundenspielIds(kandidaten, locationIds, aktuelleUids);
    if (verwaisteIds.length === 0) return 0;

    await tx.delete(termine).where(inArray(termine.id, verwaisteIds));
    return verwaisteIds.length;
  });
}

export type NuligaSyncErgebnis = {
  neu: number;
  aktualisiert: number;
  entfernt: number;
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
      entfernt: 0,
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
  const entfernt = await entferneVerwaisteRundenspiele(
    vereinId,
    hallenIds,
    new Set(ereignisse.map((e) => e.uid))
  );

  return { neu, aktualisiert, entfernt, aenderungen, parseFehler, abrufFehler, diagnose };
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

      // Der frische Import kann neue Rundenspiel-Duplikate manuell angelegter
      // Termine aufdecken (siehe duplikat-erkennung.ts) — direkt danach
      // prüfen, statt auf den nächsten Aufruf von /admin/termine zu warten.
      try {
        await sendeDuplikatBenachrichtigungen(verein.id);
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
