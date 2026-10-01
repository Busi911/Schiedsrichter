"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSystemAdmin } from "@/lib/session";
import { adminDb } from "@/db/admin";
import { eq } from "drizzle-orm";
import { vereine } from "@/db/schema";
import { schreibeProtokoll } from "@/lib/treuhand";
import { vergleicheAnsetzung } from "@/lib/ansetzung-vergleich";
import { holeNuligaHtml } from "@/lib/nuliga/client";
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

// Schaltet je Verein, ob der Liga-Sync-Cron fehlende künftige Heimspiele selbst anlegt.
export async function ligaUebernahmeSchalten(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const aktiv = formData.get("aktiv") === "1";
  await adminDb.update(vereine).set({ ligaUebernahmeAktiv: aktiv }).where(eq(vereine.id, vereinId));
  await schreibeProtokoll(
    vereinId,
    aktiv ? "liga_uebernahme_an" : "liga_uebernahme_aus",
    session.user.email ?? session.user.id,
    aktiv ? "Automatische Übernahme künftiger Heimspiele eingeschaltet" : "Automatische Übernahme ausgeschaltet"
  );
  revalidatePath("/system/abgleich");
}

// Nur lesend: vergleicht das angesetzte Schiedsrichter-Kürzel der öffentlichen nuLiga-Daten
// mit dem der Hallenplan-Termine (Vorstufe, bevor der neue Weg die Ansetzung übernimmt).
export async function ansetzungVergleichen(formData: FormData) {
  await requireSystemAdmin();
  const vereinId = formData.get("vereinId");
  if (typeof vereinId !== "string" || !vereinId) throw new Error("Verein fehlt.");
  const r = await vergleicheAnsetzung(vereinId, holeNuligaHtml);
  const params = new URLSearchParams({
    verein: vereinId,
    av: "1",
    avg: String(r.geprueft),
    avgl: String(r.gleich),
    avv: String(r.verschieden),
    avh: String(r.nurHallenplan),
    avo: String(r.nurOeffentlich),
    avl: String(r.beideLeer),
    avf: String(r.gruppenFehler),
    avb: JSON.stringify(r.beispiele),
  });
  redirect(`/system/abgleich?${params.toString()}`);
}
