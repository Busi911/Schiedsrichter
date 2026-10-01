"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSystemAdmin } from "@/lib/session";
import { uebernehmeLigaSpiele } from "@/lib/liga-uebernahme";
import { verknuepfeHallenplanTermine } from "@/lib/hallenplan-verknuepfung";

// Schritt 2a der Zusammenführung: Termine nur mit dem öffentlichen Spiel
// VERKNÜPFEN (ein Verweis je Termin), sonst ändert sich nichts.
export async function hallenplanVerknuepfen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const r = await verknuepfeHallenplanTermine(vereinId, session.user.email ?? session.user.id);
  revalidatePath("/system/abgleich");
  const params = new URLSearchParams({
    verein: vereinId,
    neu: String(r.verknuepft),
    schon: String(r.bereitsVerknuepft),
    dup: String(r.uebersprungenMehrfach),
    zv: String(r.zuordnungenVorher),
    zn: String(r.zuordnungenNachher),
  });
  redirect(`/system/abgleich?${params.toString()}`);
}

// Schritt 3: fehlende künftige Heimspiele still aus den öffentlichen Daten anlegen
// (keine Mails, keine Löschung von Hallenplan-Terminen oder Zuordnungen).
export async function ligaSpieleUebernehmen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const r = await uebernehmeLigaSpiele(vereinId, session.user.email ?? session.user.id);
  revalidatePath("/system/abgleich");
  const params = new URLSearchParams({
    verein: vereinId,
    ueb: String(r.angelegt),
    uebdup: String(r.doppelteEntfernt),
    uebdupd: String(r.doppelteMitDiensten),
    uebzeit: String(r.uebersprungenOhneZeit),
    zv: String(r.zuordnungenVorher),
    zn: String(r.zuordnungenNachher),
  });
  redirect(`/system/abgleich?${params.toString()}`);
}
