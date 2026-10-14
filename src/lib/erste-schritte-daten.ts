import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { funktionstraegerRollen, ligaVereine, mannschaften, users } from "@/db/schema";
import { istStammdatenGesperrt } from "./stammdaten-sperre";
import type { ErsteSchritteStand } from "./erste-schritte";

// Nur Zähler, jede Abfrage ausdrücklich auf den einen Verein beschränkt ("user" hat keine RLS).
export async function holeErsteSchritteStand(vereinId: string): Promise<ErsteSchritteStand> {
  const [liga, [m], [f], dienste] = await Promise.all([
    adminDb
      .select({ nuliga: ligaVereine.nuligaClubId, hnet: ligaVereine.handballNetClubId })
      .from(ligaVereine)
      .where(eq(ligaVereine.vereinId, vereinId)),
    adminDb.select({ n: sql<number>`count(*)::int` }).from(mannschaften).where(eq(mannschaften.vereinId, vereinId)),
    adminDb
      .select({ n: sql<number>`count(distinct ${users.id})::int` })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(users.id, funktionstraegerRollen.userId))
      .where(and(eq(users.vereinId, vereinId), eq(funktionstraegerRollen.aktiv, true))),
    // Dieselbe Definition wie die Stammdaten-Sperre: ein Dienst ist eingetragen (ohne automatische handball.net-Übernahme).
    istStammdatenGesperrt(vereinId),
  ]);
  return {
    spielplanAngebunden: liga.some((l) => !!l.nuliga || !!l.hnet),
    mannschaften: m?.n ?? 0,
    funktionstraegerMitRolle: f?.n ?? 0,
    einteilungen: dienste ? 1 : 0,
  };
}
