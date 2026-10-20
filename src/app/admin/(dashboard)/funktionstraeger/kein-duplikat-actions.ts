"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerKeinDuplikat, users } from "@/db/schema";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { ordnePaar } from "@/lib/funktionstraeger-duplikate";

// "Das sind zwei verschiedene Personen": das Paar wird unter "Mögliche Duplikate" nicht mehr vorgeschlagen.
export async function personenAlsVerschiedenBestaetigen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const idA = formData.get("userIdA");
  const idB = formData.get("userIdB");
  if (typeof idA !== "string" || typeof idB !== "string" || !idA || !idB || idA === idB) {
    throw new Error("Ungültige Auswahl.");
  }
  const [userIdA, userIdB] = ordnePaar(idA, idB);

  await withTenant(vereinId, async (tx) => {
    // users hat keine RLS: beide Personen müssen zum eigenen Verein gehören.
    const gefunden = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, [userIdA, userIdB]), eq(users.vereinId, vereinId)));
    if (gefunden.length !== 2) throw new Error("Person nicht gefunden.");
    await tx.insert(funktionstraegerKeinDuplikat).values({ vereinId, userIdA, userIdB }).onConflictDoNothing();
  });
  revalidatePath("/admin/funktionstraeger");
}
