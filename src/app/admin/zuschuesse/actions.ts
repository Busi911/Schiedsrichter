"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { zuschuesse } from "@/db/schema";

export async function zuschussAnlegen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const userId = formData.get("userId");
  const satzRoh = formData.get("satz");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("Person fehlt.");
  }
  const satz =
    typeof satzRoh === "string" ? Number(satzRoh.replace(",", ".")) : NaN;
  if (!Number.isFinite(satz) || satz < 0) {
    throw new Error("Ungültiger Satz.");
  }

  await withTenant(vereinId, (tx) =>
    tx.insert(zuschuesse).values({
      terminId,
      userId,
      satz: satz.toFixed(2),
      berechneterBetrag: satz.toFixed(2),
    })
  );

  revalidatePath("/admin/zuschuesse");
}
