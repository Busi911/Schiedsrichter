"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { terminZuordnungen } from "@/db/schema";
import { ZUORDENBARE_TYPEN } from "@/lib/zuordnung";

export async function zuordnen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const auswahl = formData.get("personTyp");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof auswahl !== "string" || !auswahl.includes("|")) {
    throw new Error("Bitte eine Person auswählen.");
  }
  const [userId, typ] = auswahl.split("|");
  if (!(ZUORDENBARE_TYPEN as readonly string[]).includes(typ)) {
    throw new Error("Ungültige Rolle.");
  }

  await withTenant(vereinId, async (tx) => {
    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, typ as (typeof ZUORDENBARE_TYPEN)[number])
      ),
    });
    if (vorhanden) return;

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: typ as (typeof ZUORDENBARE_TYPEN)[number],
      quelle: "zugeordnet_durch_admin",
    });
  });

  revalidatePath("/admin/zuordnung");
}

export async function zuordnungEntfernen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(terminZuordnungen).where(eq(terminZuordnungen.id, zuordnungId))
  );

  revalidatePath("/admin/zuordnung");
}
