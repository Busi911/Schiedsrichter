"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { produktFeedback } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";

// Feedback ist vereinsübergreifend: Schreiben direkt über adminDb (nur der Systemadmin, wie das Lesen auf der Seite).
export async function feedbackErledigtSetzen(formData: FormData) {
  await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  const erledigt = formData.get("erledigt") === "1";
  if (!id) return;
  await adminDb
    .update(produktFeedback)
    .set({ erledigtAm: erledigt ? new Date() : null })
    .where(eq(produktFeedback.id, id));
  revalidatePath("/system/feedback");
}
