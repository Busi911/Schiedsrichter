import "server-only";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { count, eq } from "drizzle-orm";
import { vereine } from "@/db/schema";

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

// Anzahl der Vereine, die das Beta-Limit belegen: nur aktive. Vereine im
// Vorbereitungs-Modus (Systemadmin richtet sie im Hintergrund ein, siehe
// lib/treuhand.ts) zählen erst ab der Übergabe mit.
export async function zaehleVereineFuerBetaLimit(): Promise<number> {
  const [{ value }] = await mitColdStartRetry(() =>
    adminDb.select({ value: count() }).from(vereine).where(eq(vereine.status, "aktiv"))
  );
  return value;
}
