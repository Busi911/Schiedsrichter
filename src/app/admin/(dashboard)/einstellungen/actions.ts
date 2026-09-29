"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { synchronisiereNuligaHallen } from "@/lib/rundenspiel-sync";
import { signOut } from "@/auth";

function parseAnzahl(formData: FormData, feld: string, min = 0): number {
  const roh = formData.get(feld);
  const zahl = typeof roh === "string" ? Number(roh) : NaN;
  if (!Number.isInteger(zahl) || zahl < min) {
    throw new Error(`Ungültiger Wert für ${feld}.`);
  }
  return zahl;
}

export async function vereinsdatenSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const strasse = formData.get("strasse");
  const plz = formData.get("plz");
  const ort = formData.get("ort");
  if (
    typeof strasse !== "string" ||
    typeof plz !== "string" ||
    typeof ort !== "string"
  ) {
    throw new Error("Ungültige Adresse.");
  }

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({
        strasse: strasse.trim() || null,
        plz: plz.trim() || null,
        ort: ort.trim() || null,
      })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/admin/einstellungen");
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
  const testspielKassiererBedarf = parseAnzahl(formData, "testspielKassiererBedarf");
  const turnierKassiererBedarf = parseAnzahl(formData, "turnierKassiererBedarf");
  const rundenspielKassiererBedarf = parseAnzahl(
    formData,
    "rundenspielKassiererBedarf"
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
  const offeneDiensteBroadcastAktiviert =
    formData.get("offeneDiensteBroadcastAktiviert") === "on";

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
        testspielKassiererBedarf,
        turnierKassiererBedarf,
        rundenspielKassiererBedarf,
        testspielZeitnehmerBedarf,
        turnierZeitnehmerBedarf,
        rundenspielZeitnehmerBedarf,
        offeneDiensteBroadcastAktiviert,
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

// Gefahrenzone: löscht den kompletten Verein UNWIDERRUFLICH — alle
// abhängigen Daten (Funktionsträger, Mannschaften, Hallen, Trainingszeiten,
// Termine, Zuordnungen, ...) hängen per onDelete: cascade an vereine.id
// (siehe db/schema.ts) und verschwinden mit einem einzigen DELETE
// automatisch mit, inklusive der eigenen user-Zeile des ausführenden
// Admins. Deshalb danach zwingend signOut() statt nur redirect() — die
// bestehende JWT-Session verweist sonst auf einen nicht mehr existierenden
// User. Der Vereinsname muss zur Bestätigung exakt eingetippt werden (siehe
// VereinLoeschenDialog), ein einfaches window.confirm() reicht bei diesem
// Ausmaß an Datenverlust nicht.
export async function vereinLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const bestaetigterName = formData.get("bestaetigterVereinsname");
  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
      columns: { name: true },
    })
  );
  if (
    typeof bestaetigterName !== "string" ||
    !verein ||
    bestaetigterName !== verein.name
  ) {
    throw new Error("Vereinsname stimmt nicht überein — nichts gelöscht.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(vereine).where(eq(vereine.id, vereinId))
  );

  await signOut({ redirectTo: "/" });
}
