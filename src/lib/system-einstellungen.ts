import "server-only";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";

// system_einstellungen ist als Singleton angelegt (siehe Migration
// 0045: genau eine Zeile per INSERT DEFAULT VALUES). Fallback-Objekt nur
// für den unwahrscheinlichen Fall, dass diese Zeile fehlt (z.B. manuell
// gelöscht) — Wert synchron zum Spalten-Default in db/schema.ts.
//
// mitColdStartRetry: diese Funktion wird u.a. von der öffentlichen
// Startseite (nicht eingeloggt, kein vorheriger DB-Zugriff in derselben
// Request) aufgerufen — anders als bei withTenant (db/index.ts) gab es
// hier bislang keinen Cold-Start-Schutz für adminDb, was nach
// Inaktivität zu einem harten Rendering-Fehler auf "/" führte, statt wie
// beim Login automatisch einmal erneut zu versuchen.
export async function holeSystemEinstellungen() {
  const zeile = await mitColdStartRetry(() =>
    adminDb.query.systemEinstellungen.findFirst()
  );
  return zeile ?? { id: null, betaVereinLimit: 3 };
}
