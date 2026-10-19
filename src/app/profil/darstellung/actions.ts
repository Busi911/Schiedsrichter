"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/db";
import { users } from "@/db/schema";
import { requireSession } from "@/lib/session";

// Persönliche Wahl der Darstellung (klassisch oder neues App-Design). Gilt für das eigene Konto auf allen Geräten, ändert nichts für andere Personen.
export async function designSetzen(formData: FormData) {
  const session = await requireSession();
  const neu = formData.get("design") === "neu";
  await withTenant(session.user.vereinId!, (tx) => tx.update(users).set({ designNeu: neu }).where(eq(users.id, session.user.id)));
  // Der Wechsel betrifft Kopfzeile und Navigation jeder Seite, nicht nur diese.
  revalidatePath("/", "layout");
}
