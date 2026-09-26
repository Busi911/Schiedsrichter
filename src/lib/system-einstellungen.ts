import "server-only";
import { adminDb } from "@/db/admin";

// system_einstellungen ist als Singleton angelegt (siehe Migration
// 0045: genau eine Zeile per INSERT DEFAULT VALUES). Fallback-Objekt nur
// für den unwahrscheinlichen Fall, dass diese Zeile fehlt (z.B. manuell
// gelöscht) — Wert synchron zum Spalten-Default in db/schema.ts.
export async function holeSystemEinstellungen() {
  const zeile = await adminDb.query.systemEinstellungen.findFirst();
  return zeile ?? { id: null, betaVereinLimit: 3 };
}
