import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { termine, terminZuordnungen } from "@/db/schema";
import { GESPERRTE_FELDER, STAMMDATEN_FELDER, type StammdatenFeld } from "./stammdaten-felder";

// Gesperrt, sobald für irgendeinen Termin des Vereins ein Dienst vergeben ist: vom Admin zugeordnet oder selbst eingetragen
// (angemeldet oder über den öffentlichen Link). Eine geänderte Vereins-/Team-ID könnte diese Termine verwaisen lassen.
// Nur automatisch aus handball.net übernommene Besetzungen zählen nicht (die schreibt der Sync selbst). Funktionsträger
// allein (Personen mit Rolle, aber ohne Einsatz) sperren nichts: ohne Dienste kann nichts verloren gehen.
export async function istStammdatenGesperrt(vereinId: string): Promise<boolean> {
  const [z] = await adminDb
    .select({ n: sql<number>`count(*)::int` })
    .from(terminZuordnungen)
    .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
    .where(and(eq(termine.vereinId, vereinId), ne(terminZuordnungen.quelle, "handball_net_uebernommen")));
  return (z?.n ?? 0) > 0;
}

type SessionMitKontext = { user: { treuhand?: unknown; istSystemAdmin?: boolean } };

// Wirft, wenn gesperrte Felder geändert würden. Der Systemadmin (Treuhand-/Support-Kontext) ist ausgenommen.
export async function verbieteGesperrteAenderung(
  session: SessionMitKontext,
  vereinId: string,
  geaenderteFelder: StammdatenFeld[]
): Promise<void> {
  geaenderteFelder = geaenderteFelder.filter((f) => GESPERRTE_FELDER.includes(f));
  if (geaenderteFelder.length === 0) return;
  if (session.user.treuhand || session.user.istSystemAdmin) return;
  if (!(await istStammdatenGesperrt(vereinId))) return;
  const namen = geaenderteFelder.map((f) => STAMMDATEN_FELDER[f]).join(", ");
  throw new Error(
    `Gesperrt: ${namen} lässt sich nicht mehr direkt ändern, weil für Termine bereits Dienste eingetragen sind (sonst könnten sie verloren gehen). ` +
      `Bitte unter Einstellungen → Öffentliche Vereinsseite → „Änderung beantragen“ mit Grund melden.`
  );
}
