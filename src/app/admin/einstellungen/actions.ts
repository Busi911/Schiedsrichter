"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";

function parseAnzahl(formData: FormData, feld: string): number {
  const roh = formData.get(feld);
  const zahl = typeof roh === "string" ? Number(roh) : NaN;
  if (!Number.isInteger(zahl) || zahl < 0) {
    throw new Error(`Ungültiger Wert für ${feld}.`);
  }
  return zahl;
}

export async function dienstBedarfSpeichern(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const testspielOrdnerBedarf = parseAnzahl(formData, "testspielOrdnerBedarf");
  const testspielKioskdienstBedarf = parseAnzahl(
    formData,
    "testspielKioskdienstBedarf"
  );
  const turnierOrdnerBedarf = parseAnzahl(formData, "turnierOrdnerBedarf");
  const turnierKioskdienstBedarf = parseAnzahl(
    formData,
    "turnierKioskdienstBedarf"
  );
  const rundenspielOrdnerBedarf = parseAnzahl(
    formData,
    "rundenspielOrdnerBedarf"
  );
  const rundenspielKioskdienstBedarf = parseAnzahl(
    formData,
    "rundenspielKioskdienstBedarf"
  );

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        testspielOrdnerBedarf,
        testspielKioskdienstBedarf,
        turnierOrdnerBedarf,
        turnierKioskdienstBedarf,
        rundenspielOrdnerBedarf,
        rundenspielKioskdienstBedarf,
      })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/admin/einstellungen");
}
