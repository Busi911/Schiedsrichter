"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { mitglieder, mitgliedsarten } from "@/db/schema";
import { pruefeMitglied, type GeprueftesMitglied } from "@/lib/mitglieder";
import { findeMitglied } from "@/lib/mitglieder-ueberfuehrung";
import { fuehreUeberfuehrungAus, ladeMitglieder, ladeMitgliedsarten, pruefeArtId, ueberfuehrungText, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { artNameVergeben, fehlendeStandardArten, pruefeArtName } from "@/lib/mitgliedsarten";
import { schreibeProtokoll } from "@/lib/treuhand";
import { entferneZuordnung, ordneZu } from "@/lib/mitglied-mannschaften-daten";

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
  const art = await pruefeArtId(vereinId, text(formData, "artId"));
  if ("fehler" in art) throw new Error(art.fehler);
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
  await withTenant(vereinId, (tx) => tx.insert(mitglieder).values({ vereinId, ...rest, artId: art.artId, ...(eintrittsdatum ? { eintrittsdatum } : {}) }));
  revalidatePath("/admin/mitglieder");
}

export async function mitgliedAendern(formData: FormData) {
  const vereinId = await startschuss();
  const id = text(formData, "id");
  const w = pruefe(formData);
  const art = await pruefeArtId(vereinId, text(formData, "artId"));
  if ("fehler" in art) throw new Error(art.fehler);
  await withTenant(vereinId, (tx) =>
    tx.update(mitglieder).set({ ...w, artId: art.artId, aktualisiertAm: new Date() }).where(and(eq(mitglieder.id, id), eq(mitglieder.vereinId, vereinId)))
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

// Mitglied einer Mannschaft für eine Saison zuordnen (Rolle Spieler/Trainer/Betreuer). Die Mannschaft muss zum eigenen Verein gehören.
export async function mitgliedMannschaftZuordnen(formData: FormData) {
  const vereinId = await startschuss();
  const ergebnis = await ordneZu(vereinId, {
    mitgliedId: text(formData, "mitgliedId"),
    mannschaftId: text(formData, "mannschaftId"),
    saison: text(formData, "saison"),
    rolle: text(formData, "rolle"),
  });
  if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
  revalidatePath("/admin/mitglieder");
}

export async function mitgliedMannschaftEntfernen(formData: FormData) {
  const vereinId = await startschuss();
  await entferneZuordnung(vereinId, text(formData, "id"));
  revalidatePath("/admin/mitglieder");
}

// ---------------------------------------------------------------------------
// Arten der Mitgliedschaft pflegen
// ---------------------------------------------------------------------------

export async function mitgliedsartAnlegen(formData: FormData) {
  const vereinId = await startschuss();
  const gepruefte = pruefeArtName(text(formData, "name"));
  if ("fehler" in gepruefte) throw new Error(gepruefte.fehler);
  if (artNameVergeben(gepruefte.name, await ladeMitgliedsarten(vereinId))) throw new Error(`Die Art „${gepruefte.name}“ gibt es schon.`);
  await withTenant(vereinId, (tx) => tx.insert(mitgliedsarten).values({ vereinId, name: gepruefte.name }).onConflictDoNothing());
  revalidatePath("/admin/mitglieder");
}

export async function mitgliedsartUmbenennen(formData: FormData) {
  const vereinId = await startschuss();
  const id = text(formData, "id");
  const gepruefte = pruefeArtName(text(formData, "name"));
  if ("fehler" in gepruefte) throw new Error(gepruefte.fehler);
  if (artNameVergeben(gepruefte.name, await ladeMitgliedsarten(vereinId), id)) throw new Error(`Die Art „${gepruefte.name}“ gibt es schon.`);
  await withTenant(vereinId, (tx) => tx.update(mitgliedsarten).set({ name: gepruefte.name }).where(and(eq(mitgliedsarten.id, id), eq(mitgliedsarten.vereinId, vereinId))));
  revalidatePath("/admin/mitglieder");
}

// Löschen lässt die Mitglieder bestehen (ihre Art ist danach leer).
export async function mitgliedsartLoeschen(formData: FormData) {
  const vereinId = await startschuss();
  const id = text(formData, "id");
  await withTenant(vereinId, (tx) => tx.delete(mitgliedsarten).where(and(eq(mitgliedsarten.id, id), eq(mitgliedsarten.vereinId, vereinId))));
  revalidatePath("/admin/mitglieder");
}

export async function standardArtenAnlegen() {
  const vereinId = await startschuss();
  const fehlend = fehlendeStandardArten(await ladeMitgliedsarten(vereinId));
  if (fehlend.length > 0) {
    await withTenant(vereinId, (tx) => tx.insert(mitgliedsarten).values(fehlend.map((name) => ({ vereinId, name }))).onConflictDoNothing());
  }
  revalidatePath("/admin/mitglieder");
}
