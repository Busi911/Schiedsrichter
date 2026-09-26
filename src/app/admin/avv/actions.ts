"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { AVV_VERSION } from "@/lib/avv";

// Bewusst wie die Seite selbst über auth() statt requireAdmin() geprüft
// (siehe Kommentar dort) — sonst würde eine noch nicht erteilte Zustimmung
// diese Action über den Redirect in requireAdmin() gar nicht erst
// erreichbar machen.
export async function avvAkzeptieren() {
  const session = await auth();
  if (!session?.user?.vereinId || !session.user.istAdmin) {
    throw new Error("Keine Berechtigung.");
  }
  const vereinId = session.user.vereinId;

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        avvAkzeptiertAm: new Date(),
        avvAkzeptiertVersion: AVV_VERSION,
        avvAkzeptiertVonName: session.user.name ?? session.user.email ?? "",
        avvAkzeptiertVonEmail: session.user.email ?? "",
      })
      .where(eq(vereine.id, vereinId))
  );

  redirect("/admin");
}
