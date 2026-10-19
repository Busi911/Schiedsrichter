import "server-only";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { users } from "@/db/schema";

// Persönliche Wahl der Darstellung (users.design_neu): false = klassisch (Standard), true = neues App-Design. Eigene Zeile der Person, daher nur nach der Id.
export async function holeDesignNeu(vereinId: string, userId: string): Promise<boolean> {
  const [zeile] = await withTenant(vereinId, (tx) => tx.select({ designNeu: users.designNeu }).from(users).where(eq(users.id, userId)).limit(1));
  return zeile?.designNeu ?? false;
}
