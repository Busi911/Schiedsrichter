"use server";

import { revalidatePath } from "next/cache";
import { requireSystemAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";

export async function vereinErstellen(formData: FormData) {
  await requireSystemAdmin();

  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");

  if (
    typeof vereinsname !== "string" ||
    !vereinsname.trim() ||
    typeof adminName !== "string" ||
    !adminName.trim() ||
    typeof adminEmail !== "string" ||
    !adminEmail.trim()
  ) {
    throw new Error("Bitte alle Felder ausfüllen.");
  }

  const vereinId = crypto.randomUUID();
  await withTenant(vereinId, async (tx) => {
    await tx
      .insert(vereine)
      .values({ id: vereinId, name: vereinsname.trim() });
    await tx.insert(users).values({
      email: adminEmail.trim().toLowerCase(),
      name: adminName.trim(),
      vereinId,
      istAdmin: true,
    });
  });

  revalidatePath("/system/vereine");
}
