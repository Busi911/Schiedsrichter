import "server-only";
import { eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, users } from "@/db/schema";
import { STAMMDATEN_FELDER, type StammdatenFeld } from "./stammdaten-felder";

// Gesperrt, sobald der Verein mindestens einen Funktionsträger (Rolle) hat: ab dann hängen Dienste an den Terminen,
// die eine geänderte Vereins-/Hallen-ID verwaisen lassen könnte. Ohne Funktionsträger darf der Verein frei ändern.
export async function istStammdatenGesperrt(vereinId: string): Promise<boolean> {
  const [z] = await adminDb
    .select({ n: sql<number>`count(*)::int` })
    .from(funktionstraegerRollen)
    .innerJoin(users, eq(users.id, funktionstraegerRollen.userId))
    .where(eq(users.vereinId, vereinId));
  return (z?.n ?? 0) > 0;
}

type SessionMitKontext = { user: { treuhand?: unknown; istSystemAdmin?: boolean } };

// Wirft, wenn gesperrte Felder geändert würden. Der Systemadmin (Treuhand-/Support-Kontext) ist ausgenommen.
export async function verbieteGesperrteAenderung(
  session: SessionMitKontext,
  vereinId: string,
  geaenderteFelder: StammdatenFeld[]
): Promise<void> {
  if (geaenderteFelder.length === 0) return;
  if (session.user.treuhand || session.user.istSystemAdmin) return;
  if (!(await istStammdatenGesperrt(vereinId))) return;
  const namen = geaenderteFelder.map((f) => STAMMDATEN_FELDER[f]).join(", ");
  throw new Error(
    `Gesperrt: ${namen} lässt sich nicht mehr direkt ändern, weil bereits Funktionsträger eingetragen sind (sonst könnten Termine und Dienste verloren gehen). ` +
      `Bitte unter Einstellungen → Öffentliche Vereinsseite → „Änderung beantragen“ mit Grund melden.`
  );
}
