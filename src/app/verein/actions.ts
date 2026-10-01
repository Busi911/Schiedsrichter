"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { adminDb } from "@/db/admin";
import { favoriten, ligaMannschaften, ligaVereine } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Schaltet einen Favoriten um (Verein ODER Mannschaft, unabhängig
// voneinander) und gibt den neuen Zustand zurück. Gespeichert wird nur die
// Zuordnung zum eingeloggten Nutzer — die Sportdaten selbst sind öffentlich.
export async function favoritUmschalten(
  typ: "verein" | "mannschaft",
  id: string
): Promise<{ aktiv: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Bitte zum Favorisieren einloggen.");
  if (!UUID.test(id)) throw new Error("Ungültiges Ziel.");

  const spalte = typ === "verein" ? favoriten.ligaVereinId : favoriten.ligaMannschaftId;
  const vorhanden = await adminDb.query.favoriten.findFirst({
    where: and(eq(favoriten.userId, userId), eq(spalte, id)),
  });
  if (vorhanden) {
    await adminDb.delete(favoriten).where(eq(favoriten.id, vorhanden.id));
    return { aktiv: false };
  }

  const existiert =
    typ === "verein"
      ? await adminDb.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, id), columns: { id: true } })
      : await adminDb.query.ligaMannschaften.findFirst({
          where: eq(ligaMannschaften.id, id),
          columns: { id: true },
        });
  if (!existiert) throw new Error("Ziel nicht gefunden.");

  await adminDb
    .insert(favoriten)
    .values(typ === "verein" ? { userId, ligaVereinId: id } : { userId, ligaMannschaftId: id })
    .onConflictDoNothing();
  return { aktiv: true };
}
