"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { systemEinstellungen } from "@/db/schema";
import { begrenzeOutreachProLauf } from "@/lib/outreach-einstellungen";
import { requireSystemAdmin } from "@/lib/session";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";

// system_einstellungen ist ein Singleton ohne verein_id/RLS: Schreiben direkt über adminDb (wie betaVereinLimitSpeichern).
export async function outreachEinstellungenSpeichern(formData: FormData) {
  await requireSystemAdmin();
  const werte = {
    outreachAktiv: formData.get("outreachAktiv") === "on",
    outreachNachfassAktiv: formData.get("outreachNachfassAktiv") === "on",
    outreachProLauf: begrenzeOutreachProLauf(formData.get("outreachProLauf")),
  };
  const bestehend = await holeSystemEinstellungen();
  if (bestehend.id) {
    await adminDb.update(systemEinstellungen).set(werte).where(eq(systemEinstellungen.id, bestehend.id));
  } else {
    await adminDb.insert(systemEinstellungen).values(werte);
  }
  revalidatePath("/system/ansprache");
}
