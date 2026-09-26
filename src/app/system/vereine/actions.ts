"use server";

import { revalidatePath } from "next/cache";
import { requireSystemAdmin } from "@/lib/session";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";

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

  await legeVereinMitAdminAn(vereinsname, adminName, adminEmail);

  revalidatePath("/system/vereine");
}
