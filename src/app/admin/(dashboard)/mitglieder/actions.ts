"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { mitglieder } from "@/db/schema";
import { pruefeMitglied, type GeprueftesMitglied } from "@/lib/mitglieder";
import { vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";

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
