"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { mitglieder, mitgliedsarten } from "@/db/schema";
import { heuteBerlin, pruefeMitglied, type GeprueftesMitglied } from "@/lib/mitglieder";
import { planeImport } from "@/lib/mitglieder-import";
import { leseMitgliederExcel } from "@/lib/mitglieder-excel";
import { findeMitglied } from "@/lib/mitglieder-ueberfuehrung";
import { ergaenzeFunktionstraegerName, fuehreUeberfuehrungAus, ladeMitglieder, ladeMitgliedsarten, pruefeArtId, schreibeImportPlan, ueberfuehrungText, vereinsverwaltungAktiv } from "@/lib/mitglieder-daten";
import { artNameVergeben, fehlendeStandardArten, pruefeArtName } from "@/lib/mitgliedsarten";
import { schreibeProtokoll } from "@/lib/treuhand";
import { lehneAntragAb, loescheBearbeitetenAntrag, nehmeAntragAn } from "@/lib/beitritt-daten";
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

// ---------------------------------------------------------------------------
// Excel-Import
// ---------------------------------------------------------------------------

const MAX_DATEI_BYTES = 5 * 1024 * 1024;

// Legt die gültigen neuen Mitglieder aus einer Excel-Datei an. Wer es schon gibt (E-Mail oder Name, auch in der Datei selbst), wird übersprungen; unbekannte Arten werden angelegt.
// Ergebnis (Zahlen und die ersten Probleme) geht per Redirect an die Seite.
export async function mitgliederImportieren(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = await startschuss();

  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) throw new Error("Bitte eine Excel-Datei (.xlsx) auswählen.");
  if (datei.size > MAX_DATEI_BYTES) throw new Error("Die Datei ist zu groß (höchstens 5 MB).");

  let gelesen;
  try {
    gelesen = await leseMitgliederExcel(Buffer.from(await datei.arrayBuffer()));
  } catch {
    throw new Error("Die Datei konnte nicht gelesen werden. Bitte eine Excel-Datei (.xlsx) verwenden.");
  }
  if (gelesen.fehler) throw new Error(gelesen.fehler);

  const [vorhandene, arten] = await Promise.all([ladeMitglieder(vereinId), ladeMitgliedsarten(vereinId)]);
  const plan = planeImport(gelesen.zeilen, {
    vorhandene: vorhandene.map((m) => ({ id: m.id, name: m.name, vorname: m.vorname, email: m.email, userId: m.userId, geburtsdatum: m.geburtsdatum })),
    arten,
    heute: heuteBerlin(),
  });

  await schreibeImportPlan(vereinId, plan);

  await schreibeProtokoll(
    vereinId,
    "mitglieder_import",
    session.user.email ?? "Admin",
    `Excel-Import: ${plan.neu.length} angelegt, ${plan.uebersprungen.length} übersprungen, ${plan.fehler.length} mit Fehler${plan.neueArten.length ? `, neue Arten: ${plan.neueArten.join(", ")}` : ""}`
  ).catch(() => undefined);
  revalidatePath("/admin/mitglieder");

  const probleme = [
    ...plan.fehler.map((f) => `Zeile ${f.zeilenNr}: ${f.grund}`),
    ...plan.uebersprungen.map((u) => `Zeile ${u.zeilenNr}: übersprungen. ${u.grund}`),
  ].sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  const params = new URLSearchParams();
  params.set("importAngelegt", String(plan.neu.length));
  params.set("importUebersprungen", String(plan.uebersprungen.length));
  params.set("importFehler", String(plan.fehler.length));
  if (plan.neueArten.length) params.set("importArten", plan.neueArten.join(", "));
  if (probleme.length) params.set("importProbleme", probleme.slice(0, 15).join(" | ") + (probleme.length > 15 ? ` | … und ${probleme.length - 15} weitere` : ""));
  redirect(`/admin/mitglieder?${params.toString()}`);
}

// Fehlenden Nachnamen (bzw. Vor- und Nachnamen) eines Funktionsträgers ergänzen: der Name wird beim Funktionsträger gesetzt und die Person sofort als Mitglied übernommen.
export async function funktionstraegerNameErgaenzen(formData: FormData) {
  const vereinId = await startschuss();
  const ergebnis = await ergaenzeFunktionstraegerName(vereinId, text(formData, "userId"), text(formData, "vorname"), text(formData, "nachname"));
  if ("fehler" in ergebnis) throw new Error(ergebnis.fehler);
  revalidatePath("/admin/mitglieder");
  revalidatePath("/admin/funktionstraeger");
}

// ---------------------------------------------------------------------------
// Beitrittsanträge (Online-Beitritt)
// ---------------------------------------------------------------------------

export async function beitrittAnnehmen(formData: FormData) {
  const vereinId = await startschuss();
  const ergebnis = await nehmeAntragAn(vereinId, text(formData, "id"), { trotzdem: formData.get("trotzdem") === "on" });
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  revalidatePath("/admin/mitglieder");
}

export async function beitrittAblehnen(formData: FormData) {
  const vereinId = await startschuss();
  const ergebnis = await lehneAntragAb(vereinId, text(formData, "id"), text(formData, "grund"));
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  revalidatePath("/admin/mitglieder");
}

export async function beitrittAntragLoeschen(formData: FormData) {
  const vereinId = await startschuss();
  const ergebnis = await loescheBearbeitetenAntrag(vereinId, text(formData, "id"));
  if (!ergebnis.ok) throw new Error(ergebnis.fehler);
  revalidatePath("/admin/mitglieder");
}
