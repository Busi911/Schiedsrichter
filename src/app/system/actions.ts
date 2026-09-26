"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireSystemAdmin } from "@/lib/session";
import { adminDb } from "@/db/admin";
import { systemEinstellungen } from "@/db/schema";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";

// Direkt über adminDb statt withTenant: system_einstellungen ist bewusst
// OHNE verein_id/RLS (siehe Tabellen-Kommentar in db/schema.ts) — ein
// echter Singleton ohne Mandantenbezug, withTenant würde hier nichts
// isolieren, das isoliert werden müsste.
export async function betaVereinLimitSpeichern(formData: FormData) {
  await requireSystemAdmin();

  const limitRoh = formData.get("betaVereinLimit");
  const limit = Number(limitRoh);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Ungültiges Limit — bitte eine ganze Zahl ≥ 0 angeben.");
  }

  const bestehend = await holeSystemEinstellungen();
  if (bestehend.id) {
    await adminDb
      .update(systemEinstellungen)
      .set({ betaVereinLimit: limit })
      .where(eq(systemEinstellungen.id, bestehend.id));
  } else {
    await adminDb.insert(systemEinstellungen).values({ betaVereinLimit: limit });
  }

  revalidatePath("/system");
}
