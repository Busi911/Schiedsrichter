"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { mitglieder } from "@/db/schema";
import { pruefeMitglied, type GeprueftesMitglied } from "@/lib/mitglieder";
import { findeMitglied } from "@/lib/mitglieder-ueberfuehrung";
import { fuehreUeberfuehrungAus, ladeMitglieder, ueberfuehrungText, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { schreibeProtokoll } from "@/lib/treuhand";

function text(formData: FormData, feld: string): string {
  const w = formData.get(feld);
  return typeof w === "string" ? w : "";
}

function pruefe(formData: FormData): GeprueftesMitglied {
  const ergebnis = pruefeMitglied({
    name: text(formData, "name"),
    vorname: text(formData, "vorname"),
    geburtsdatum: text(formData, "geburtsdatum"),
    email: text(formData, "email"),
    telefon: text(formData, "telefon"),
    geschlecht: text(formData, "geschlecht"),
    status: text(formData, "status"),
    eintrittsdatum: text(formData, "eintrittsdatum"),
    austrittsdatum: text(formData, "austrittsdatum"),
    bemerkung: text(formData, "bemerkung"),
  });
  if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
  return ergebnis.wert;
}

async function startschuss() {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  if (!(await vereinsverwaltungAktiv(vereinId))) throw new Error("Die Vereinsverwaltung ist für diesen Verein nicht freigeschaltet.");
  return vereinId;
}

export async function mitgliedAnlegen(formData: FormData) {
  const vereinId = await startschuss();
  const w = pruefe(formData);
  // Duplikatprüfung: gleiche E-Mail oder gleicher Name (bei bekanntem Geburtsdatum nur bei gleichem Datum). Nur mit Haken "Trotzdem anlegen" wird trotzdem angelegt.
  if (formData.get("trotzdem") !== "on") {
    const treffer = findeMitglied({ vorname: w.vorname, name: w.name, email: w.email, geburtsdatum: w.geburtsdatum }, await ladeMitglieder(vereinId));
    if (treffer) {
      throw new Error(
        `Es gibt schon ein Mitglied „${treffer.mitglied.name}, ${treffer.mitglied.vorname}“${treffer.mitglied.email ? ` (${treffer.mitglied.email})` : ""}. ` +
          "Bitte dieses bearbeiten, oder bei einer anderen Person mit gleichem Namen den Haken „Trotzdem neu anlegen“ setzen."
      );
    }
  }
  // Leeres Eintrittsdatum: Spaltenstandard (heute) greift nur ohne Wert, deshalb weglassen.
  const { eintrittsdatum, ...rest } = w;
  await withTenant(vereinId, (tx) => tx.insert(mitglieder).values({ vereinId, ...rest, ...(eintrittsdatum ? { eintrittsdatum } : {}) }));
  revalidatePath("/admin/mitglieder");
}

export async function mitgliedAendern(formData: FormData) {
  const vereinId = await startschuss();
  const id = text(formData, "id");
  const w = pruefe(formData);
  await withTenant(vereinId, (tx) =>
    tx.update(mitglieder).set({ ...w, aktualisiertAm: new Date() }).where(and(eq(mitglieder.id, id), eq(mitglieder.vereinId, vereinId)))
  );
  revalidatePath("/admin/mitglieder");
}

export async function mitgliedLoeschen(formData: FormData) {
  const vereinId = await startschuss();
  const id = text(formData, "id");
  await withTenant(vereinId, (tx) => tx.delete(mitglieder).where(and(eq(mitglieder.id, id), eq(mitglieder.vereinId, vereinId))));
  revalidatePath("/admin/mitglieder");
}

// Funktionsträger in die Mitgliederliste übernehmen bzw. abgleichen (auch Knopf auf der Mitgliederseite). Idempotent, legt nie doppelt an.
export async function funktionstraegerUebernehmen() {
  const session = await requireAdminSchreibzugriff();
  const vereinId = await startschuss();
  const ergebnis = await fuehreUeberfuehrungAus(vereinId);
  await schreibeProtokoll(vereinId, "mitglieder_ueberfuehrt", session.user.email ?? "Admin", `Funktionsträger übernommen: ${ueberfuehrungText(ergebnis)}`);
  revalidatePath("/admin/mitglieder");
}
