"use server";

import { redirect } from "next/navigation";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";

export async function bootstrapVerein(formData: FormData) {
  const secret = formData.get("secret");
  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");

  if (!process.env.SETUP_SECRET) {
    throw new Error(
      "SETUP_SECRET ist nicht gesetzt — Setup-Route ist deaktiviert."
    );
  }
  if (secret !== process.env.SETUP_SECRET) {
    throw new Error("Ungültiges Setup-Secret.");
  }
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
    await tx.insert(vereine).values({ id: vereinId, name: vereinsname.trim() });
    // "user" hat bewusst kein RLS (siehe Migration 0001) — Insert läuft hier
    // trotzdem innerhalb der withTenant-Transaktion, das ist unschädlich.
    await tx.insert(users).values({
      email: adminEmail.trim().toLowerCase(),
      name: adminName.trim(),
      vereinId,
      istAdmin: true,
    });
  });

  redirect("/login");
}
