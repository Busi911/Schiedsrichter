"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine, zuschuesse, zuschussarten } from "@/db/schema";

export async function zuschussAktivierungSpeichern(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const aktiviert = formData.get("aktiviert") === "on";

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({ zuschuesseAktiviert: aktiviert })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/admin/zuschuesse");
}

export async function zuschussartAnlegen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const bezeichnung = formData.get("bezeichnung");
  const satzRoh = formData.get("satz");

  if (typeof bezeichnung !== "string" || !bezeichnung.trim()) {
    throw new Error("Bezeichnung ist erforderlich.");
  }
  const satz =
    typeof satzRoh === "string" ? Number(satzRoh.replace(",", ".")) : NaN;
  if (!Number.isFinite(satz) || satz < 0) {
    throw new Error("Ungültiger Satz.");
  }

  await withTenant(vereinId, (tx) =>
    tx.insert(zuschussarten).values({
      vereinId,
      bezeichnung: bezeichnung.trim(),
      satz: satz.toFixed(2),
    })
  );

  revalidatePath("/admin/zuschuesse");
}

export async function zuschussartEntfernen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const zuschussartId = formData.get("zuschussartId");
  if (typeof zuschussartId !== "string" || !zuschussartId) {
    throw new Error("Zuschussart fehlt.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(zuschussarten).where(eq(zuschussarten.id, zuschussartId))
  );

  revalidatePath("/admin/zuschuesse");
}

export async function zuschussAnlegen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const userId = formData.get("userId");
  const zuschussartId = formData.get("zuschussartId");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("Person fehlt.");
  }
  if (typeof zuschussartId !== "string" || !zuschussartId) {
    throw new Error("Zuschussart fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    const art = await tx.query.zuschussarten.findFirst({
      where: eq(zuschussarten.id, zuschussartId),
    });
    if (!art) throw new Error("Zuschussart nicht gefunden.");

    await tx.insert(zuschuesse).values({
      terminId,
      userId,
      zuschussartId: art.id,
      satz: art.satz,
      berechneterBetrag: art.satz,
    });
  });

  revalidatePath("/admin/zuschuesse");
}
