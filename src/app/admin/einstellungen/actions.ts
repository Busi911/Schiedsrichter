"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { synchronisiereNuligaHallen } from "@/lib/rundenspiel-sync";

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

function parseHalleId(formData: FormData, feld: string): string | null {
  const roh = formData.get(feld);
  if (typeof roh !== "string" || !roh.trim()) return null;
  if (!/^\d+$/.test(roh.trim())) {
    throw new Error(`${feld}: bitte nur Zahlen eingeben.`);
  }
  return roh.trim();
}

// Speichert die Hallen-IDs + Aktivierung und stößt sofort einen ersten
// Sync an (statt erst auf den nächsten Mo/Do-Cron zu warten) — direkt nach
// dem Eintragen der IDs will man i.d.R. sofort sehen, dass es funktioniert.
export async function nuligaEinstellungenSpeichern(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const nuligaHalle1Id = parseHalleId(formData, "nuligaHalle1Id");
  const nuligaHalle2Id = parseHalleId(formData, "nuligaHalle2Id");
  const nuligaHalle3Id = parseHalleId(formData, "nuligaHalle3Id");
  const nuligaAutoImportAktiviert = formData.get("nuligaAutoImportAktiviert") === "on";

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        nuligaHalle1Id,
        nuligaHalle2Id,
        nuligaHalle3Id,
        nuligaAutoImportAktiviert,
      })
      .where(eq(vereine.id, vereinId))
  );

  const hallenIds = [nuligaHalle1Id, nuligaHalle2Id, nuligaHalle3Id].filter(
    (id): id is string => id !== null
  );

  const params = new URLSearchParams();
  if (nuligaAutoImportAktiviert && hallenIds.length > 0) {
    const ergebnis = await synchronisiereNuligaHallen(vereinId, hallenIds);
    params.set("nuligaNeu", String(ergebnis.neu));
    params.set("nuligaAktualisiert", String(ergebnis.aktualisiert));
    const fehlerListe = [
      ...ergebnis.abrufFehler.map(
        (f) => `Halle ${f.locationId} (${f.requestedMonth}): ${f.grund}`
      ),
      ...ergebnis.parseFehler.map((f) => `Eintrag ${f.index}: ${f.grund}`),
    ];
    if (fehlerListe.length) params.set("nuligaFehler", fehlerListe.join(" | "));
  }

  revalidatePath("/admin/einstellungen");
  redirect(`/admin/einstellungen?${params.toString()}`);
}
