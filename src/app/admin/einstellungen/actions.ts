"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { synchronisiereNuligaHallen } from "@/lib/rundenspiel-sync";

function parseAnzahl(formData: FormData, feld: string, min = 0): number {
  const roh = formData.get(feld);
  const zahl = typeof roh === "string" ? Number(roh) : NaN;
  if (!Number.isInteger(zahl) || zahl < min) {
    throw new Error(`Ungültiger Wert für ${feld}.`);
  }
  return zahl;
}

export async function dienstBedarfSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
  const testspielZeitnehmerBedarf = parseAnzahl(
    formData,
    "testspielZeitnehmerBedarf"
  );
  const turnierZeitnehmerBedarf = parseAnzahl(
    formData,
    "turnierZeitnehmerBedarf"
  );
  const rundenspielZeitnehmerBedarf = parseAnzahl(
    formData,
    "rundenspielZeitnehmerBedarf"
  );
  // Mindestens 1: eine Obergrenze von 0 würde JEDE Zuordnung blockieren.
  const zeitnehmerSekretaerMax = parseAnzahl(
    formData,
    "zeitnehmerSekretaerMax",
    1
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
        testspielZeitnehmerBedarf,
        turnierZeitnehmerBedarf,
        rundenspielZeitnehmerBedarf,
        zeitnehmerSekretaerMax,
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
// Sync an (statt erst auf den nächsten täglichen Cron zu warten) — direkt
// nach dem Eintragen der IDs will man i.d.R. sofort sehen, dass es
// funktioniert.
export async function nuligaEinstellungenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const nuligaHalle1Id = parseHalleId(formData, "nuligaHalle1Id");
  const nuligaHalle2Id = parseHalleId(formData, "nuligaHalle2Id");
  const nuligaHalle3Id = parseHalleId(formData, "nuligaHalle3Id");
  const nuligaAutoImportAktiviert = formData.get("nuligaAutoImportAktiviert") === "on";
  const rundenspielAenderungenBenachrichtigungAktiviert =
    formData.get("rundenspielAenderungenBenachrichtigungAktiviert") === "on";

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        nuligaHalle1Id,
        nuligaHalle2Id,
        nuligaHalle3Id,
        nuligaAutoImportAktiviert,
        rundenspielAenderungenBenachrichtigungAktiviert,
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
    params.set("nuligaEntfernt", String(ergebnis.entfernt));
    const fehlerListe = [
      ...ergebnis.abrufFehler.map(
        (f) => `Halle ${f.locationId} (${f.requestedMonth}): ${f.grund}`
      ),
      ...ergebnis.parseFehler.map((f) => `Eintrag ${f.index}: ${f.grund}`),
    ];
    if (fehlerListe.length) params.set("nuligaFehler", fehlerListe.join(" | "));

    // Diagnose IMMER anzeigen (auch ohne Fehler) — sonst ist "0 Spiele
    // gefunden" von "Seite falsch geparst" nicht zu unterscheiden.
    const statusCodes = [...new Set(ergebnis.diagnose.map((d) => d.httpStatus))];
    const zeilenGesamt = ergebnis.diagnose.reduce((s, d) => s + d.zeilenGefunden, 0);
    const htmlLaengeGesamt = ergebnis.diagnose.reduce((s, d) => s + d.htmlLaenge, 0);
    params.set(
      "nuligaDiagnose",
      `${ergebnis.diagnose.length} Anfragen, HTTP ${statusCodes.join("/") || "—"}, ` +
        `${zeilenGesamt} Tabellenzeilen, ${htmlLaengeGesamt} Zeichen HTML insgesamt`
    );
  }

  revalidatePath("/admin/einstellungen");
  redirect(`/admin/einstellungen?${params.toString()}`);
}
