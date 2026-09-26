"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { hallen, trainingszeiten } from "@/db/schema";
import { begrenze, rundeAufRaster } from "@/lib/trainingsplan";

function parseHalleId(formData: FormData): string {
  const halleId = formData.get("halleId");
  if (typeof halleId !== "string" || !halleId) {
    throw new Error("Halle fehlt.");
  }
  return halleId;
}

export async function halleAnlegen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId!, (tx) =>
    tx.insert(hallen).values({ vereinId: vereinId!, name: name.trim() })
  );

  revalidatePath("/admin/trainingsplan");
}

export async function halleUmbenennen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;
  const halleId = parseHalleId(formData);

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId!, (tx) =>
    tx
      .update(hallen)
      .set({ name: name.trim() })
      .where(and(eq(hallen.id, halleId), eq(hallen.vereinId, vereinId!)))
  );

  revalidatePath("/admin/trainingsplan");
}

// Löscht auch alle Trainingszeiten dieser Halle mit (onDelete: "cascade" im
// Schema) — bewusst ohne Rückfrage-Zusammenfassung hier, die Bestätigung
// dafür übernimmt ConfirmSubmitButton in der aufrufenden Komponente.
export async function halleLoeschen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;
  const halleId = parseHalleId(formData);

  await withTenant(vereinId!, (tx) =>
    tx.delete(hallen).where(and(eq(hallen.id, halleId), eq(hallen.vereinId, vereinId!)))
  );

  revalidatePath("/admin/trainingsplan");
}

// Gemeinsame Validierung für Anlegen/Verschieben+Resizen eines
// Trainingszeit-Blocks (siehe TrainingsplanGrid) — Werte kommen aus einer
// per Pointer-Drag berechneten Pixel->Minuten-Umrechnung im Client und
// werden hier sicherheitshalber erneut aufs Raster gerundet/begrenzt, statt
// dem Client blind zu vertrauen.
function parseZeitfenster(formData: FormData): {
  wochentag: number;
  startMinuten: number;
  endMinuten: number;
} {
  const wochentagRoh = Number(formData.get("wochentag"));
  if (!Number.isInteger(wochentagRoh) || wochentagRoh < 0 || wochentagRoh > 6) {
    throw new Error("Ungültiger Wochentag.");
  }

  const startRoh = Number(formData.get("startMinuten"));
  const endRoh = Number(formData.get("endMinuten"));
  if (!Number.isFinite(startRoh) || !Number.isFinite(endRoh)) {
    throw new Error("Ungültiges Zeitfenster.");
  }

  const startMinuten = begrenze(rundeAufRaster(startRoh), 0, 24 * 60 - 15);
  const endMinuten = begrenze(rundeAufRaster(endRoh), startMinuten + 15, 24 * 60);

  return { wochentag: wochentagRoh, startMinuten, endMinuten };
}

export async function trainingszeitAnlegen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const mannschaftId = formData.get("mannschaftId");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }
  const halleId = parseHalleId(formData);
  const { wochentag, startMinuten, endMinuten } = parseZeitfenster(formData);
  const farbe = formData.get("farbe");
  if (farbe !== null && (typeof farbe !== "string" || !/^#[0-9a-fA-F]{6}$/.test(farbe))) {
    throw new Error("Ungültige Farbe.");
  }

  await withTenant(vereinId!, (tx) =>
    tx.insert(trainingszeiten).values({
      vereinId: vereinId!,
      mannschaftId,
      halleId,
      wochentag,
      startMinuten,
      endMinuten,
      ...(typeof farbe === "string" ? { farbe } : {}),
    })
  );

  revalidatePath("/admin/trainingsplan");
}

// Deckt sowohl Verschieben (neuer Wochentag/neue Startzeit, Dauer bleibt) als
// auch Resizen (Startzeit bleibt, neue Endzeit) ab — beides läuft im Grid auf
// dieselbe "neues Zeitfenster speichern"-Aktion hinaus, siehe
// TrainingsplanGrid.
export async function trainingszeitVerschieben(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Trainingszeit fehlt.");
  }
  const { wochentag, startMinuten, endMinuten } = parseZeitfenster(formData);

  await withTenant(vereinId!, (tx) =>
    tx
      .update(trainingszeiten)
      .set({ wochentag, startMinuten, endMinuten })
      .where(and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)))
  );

  revalidatePath("/admin/trainingsplan");
}

// Voller Bearbeiten-Dialog (Mannschaft/Halle/Wochentag/Zeit/Farbe auf
// einmal) — anders als trainingszeitVerschieben oben (nur Wochentag/Zeit,
// für Drag&Drop bzw. Resizen im Grid) deckt das hier auch einen
// Hallen-/Mannschafts-/Farbwechsel über die Bearbeiten-Dialog-Formularfelder
// ab (siehe TrainingszeitDialog).
export async function trainingszeitAktualisieren(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Trainingszeit fehlt.");
  }
  const mannschaftId = formData.get("mannschaftId");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }
  const halleId = parseHalleId(formData);
  const { wochentag, startMinuten, endMinuten } = parseZeitfenster(formData);
  const farbe = formData.get("farbe");
  if (typeof farbe !== "string" || !/^#[0-9a-fA-F]{6}$/.test(farbe)) {
    throw new Error("Ungültige Farbe.");
  }

  await withTenant(vereinId!, (tx) =>
    tx
      .update(trainingszeiten)
      .set({ mannschaftId, halleId, wochentag, startMinuten, endMinuten, farbe })
      .where(and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)))
  );

  revalidatePath("/admin/trainingsplan");
}

export async function trainingszeitLoeschen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Trainingszeit fehlt.");
  }

  await withTenant(vereinId!, (tx) =>
    tx
      .delete(trainingszeiten)
      .where(and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)))
  );

  revalidatePath("/admin/trainingsplan");
}
