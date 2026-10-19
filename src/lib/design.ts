import "server-only";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";
import { istDesignNeu } from "./design-regel";

// Darstellung der Person (users.design_neu): true/false = eigene Wahl, null = Standard des Vereins (design-regel.ts: Demo und neue Vereine neu, Bestand klassisch).
export async function holeDesignNeu(vereinId: string, userId: string): Promise<boolean> {
  const [zeile] = await withTenant(vereinId, async (tx) => {
    const [u] = await tx.select({ designNeu: users.designNeu }).from(users).where(eq(users.id, userId)).limit(1);
    if (u?.designNeu != null) return [{ designNeu: u.designNeu, istDemo: false, erstelltAm: new Date(0) }];
    const [v] = await tx.select({ istDemo: vereine.istDemo, erstelltAm: vereine.erstelltAm }).from(vereine).where(eq(vereine.id, vereinId)).limit(1);
    return [{ designNeu: null, istDemo: v?.istDemo ?? false, erstelltAm: v?.erstelltAm ?? new Date(0) }];
  });
  return istDesignNeu(zeile?.designNeu ?? null, zeile?.istDemo ?? false, zeile?.erstelltAm ?? new Date(0));
}
