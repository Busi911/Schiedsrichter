"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant, type db } from "@/db";
import { hallen, trainingszeiten, vereine } from "@/db/schema";
import { begrenze, pruefeTeilung, rundeAufRaster } from "@/lib/trainingsplan";

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

// Liest bis zu 4 optionale Abteil-Namen aus dem Formular — leere Felder
// werden zu null (Fallback "Abteil N" übernimmt dann die UI), nicht zu
// leeren Strings, damit ein späteres "Feld wieder freigelassen" den
// vorherigen Namen sauber löscht statt einen leeren Namen zu speichern.
function parseAbteilName(formData: FormData, feld: string): string | null {
  const roh = formData.get(feld);
  return typeof roh === "string" && roh.trim() ? roh.trim() : null;
}

// Name UND Abteil-Unterteilung in einem Formular/einer Aktion, da beide im
// selben "Halle bearbeiten"-Dialog gepflegt werden (siehe
// HalleBearbeitenDialog) — separate Speichern-Buttons dafür wären nur
// zusätzliche Klicks ohne eigenen Nutzen.
export async function halleBearbeiten(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;
  const halleId = parseHalleId(formData);

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  const abteilAnzahl = Number(formData.get("abteilAnzahl") ?? 0);
  if (!Number.isInteger(abteilAnzahl) || abteilAnzahl < 0 || abteilAnzahl > 4) {
    throw new Error("Ungültige Anzahl Abteile (0-4).");
  }

  await withTenant(vereinId!, async (tx) => {
    await tx
      .update(hallen)
      .set({
        name: name.trim(),
        abteilAnzahl,
        // Namen von Abteilen jenseits der neuen Anzahl explizit löschen —
        // sonst würde ein später wieder erhöhtes abteilAnzahl den alten,
        // eigentlich schon "entfernten" Namen unerwartet wieder aufleben
        // lassen.
        abteil1Name: abteilAnzahl >= 1 ? parseAbteilName(formData, "abteil1Name") : null,
        abteil2Name: abteilAnzahl >= 2 ? parseAbteilName(formData, "abteil2Name") : null,
        abteil3Name: abteilAnzahl >= 3 ? parseAbteilName(formData, "abteil3Name") : null,
        abteil4Name: abteilAnzahl >= 4 ? parseAbteilName(formData, "abteil4Name") : null,
      })
      .where(and(eq(hallen.id, halleId), eq(hallen.vereinId, vereinId!)));

    // Trainingszeiten, deren zugewiesenes Abteil durch eine verkleinerte
    // Anzahl nicht mehr existiert, verlieren die Zuweisung — sonst würde im
    // Grid/der Agenda ein Abteil-Label für ein gar nicht mehr vorhandenes
    // Abteil auftauchen.
    await tx
      .update(trainingszeiten)
      .set({ abteilNummer: null })
      .where(
        and(
          eq(trainingszeiten.halleId, halleId),
          eq(trainingszeiten.vereinId, vereinId!),
          gt(trainingszeiten.abteilNummer, abteilAnzahl)
        )
      );
  });

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

// Leer/nicht gesetzt = kein Abteil zugewiesen (null) — z.B. bei einer nicht
// unterteilten Halle, oder wenn der Wart es bewusst offenlässt. Der
// eigentliche Abgleich gegen die Anzahl Abteile DIESER Halle passiert erst
// in trainingszeitAnlegen/-Aktualisieren (dort ist die Halle bereits
// bekannt) — hier nur das grobe 1-4-Format.
function parseAbteilNummerRoh(formData: FormData): number | null {
  const roh = formData.get("abteilNummer");
  if (roh === null || roh === "") return null;
  const zahl = Number(roh);
  if (!Number.isInteger(zahl) || zahl < 1 || zahl > 4) {
    throw new Error("Ungültiges Abteil.");
  }
  return zahl;
}

// Wirft, wenn ein gewünschtes Abteil die Anzahl Abteile der Halle
// übersteigt — verhindert, dass ein manipuliertes Formular (das
// TrainingszeitDialog bietet im UI ohnehin nur gültige Optionen an) ein gar
// nicht existierendes Abteil zuweist.
async function pruefeAbteilNummer(
  tx: typeof db,
  halleId: string,
  abteilNummer: number | null
) {
  if (abteilNummer == null) return;
  const halle = await tx.query.hallen.findFirst({
    where: eq(hallen.id, halleId),
    columns: { abteilAnzahl: true },
  });
  if (!halle || abteilNummer > halle.abteilAnzahl) {
    throw new Error("Dieses Abteil gibt es in der gewählten Halle nicht (mehr).");
  }
}

export async function trainingszeitAnlegen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const mannschaftId = formData.get("mannschaftId");
  if (typeof mannschaftId !== "string" || !mannschaftId) {
    throw new Error("Mannschaft fehlt.");
  }
  const halleId = parseHalleId(formData);
  const { wochentag, startMinuten, endMinuten } = parseZeitfenster(formData);
  const abteilNummer = parseAbteilNummerRoh(formData);
  const farbe = formData.get("farbe");
  if (farbe !== null && (typeof farbe !== "string" || !/^#[0-9a-fA-F]{6}$/.test(farbe))) {
    throw new Error("Ungültige Farbe.");
  }

  await withTenant(vereinId!, async (tx) => {
    await pruefeAbteilNummer(tx, halleId, abteilNummer);
    await tx.insert(trainingszeiten).values({
      vereinId: vereinId!,
      mannschaftId,
      halleId,
      wochentag,
      startMinuten,
      endMinuten,
      abteilNummer,
      ...(typeof farbe === "string" ? { farbe } : {}),
    });
  });

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
  // Nur wenn das Grid ein Abteil mitschickt (Ziehen in eine andere Abteil-Spur einer unterteilten Halle); sonst bleibt das Abteil unverändert.
  const abteilMitgeschickt = formData.has("abteilNummer");
  const abteilNummer = abteilMitgeschickt ? parseAbteilNummerRoh(formData) : null;

  await withTenant(vereinId!, async (tx) => {
    if (abteilMitgeschickt) {
      const zeile = await tx.query.trainingszeiten.findFirst({
        where: and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)),
        columns: { halleId: true },
      });
      if (!zeile) throw new Error("Trainingszeit nicht gefunden.");
      await pruefeAbteilNummer(tx, zeile.halleId, abteilNummer);
    }
    await tx
      .update(trainingszeiten)
      .set({ wochentag, startMinuten, endMinuten, ...(abteilMitgeschickt ? { abteilNummer } : {}) })
      .where(and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)));
  });

  revalidatePath("/admin/trainingsplan");
}

// Teilt eine Trainingszeit in zwei aufeinanderfolgende Abschnitte (Wechsel): der erste behält Abteil und Beginn und endet zum Wechselzeitpunkt,
// der zweite beginnt dort, läuft bis zum alten Ende und kann ein anderes Abteil belegen (z.B. erste halbe Stunde Nord, zweite Süd). Beide gehören
// derselben Mannschaft in derselben Halle am selben Tag, haben dieselbe Farbe und lassen sich danach einzeln ändern, tauschen oder löschen.
export async function trainingszeitTeilen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const id = formData.get("id");
  if (typeof id !== "string" || !id) throw new Error("Trainingszeit fehlt.");
  const teil = Number(formData.get("wechselMinuten"));
  const zweitesAbteil = parseAbteilNummerRoh(formData);

  await withTenant(vereinId!, async (tx) => {
    const zeile = await tx.query.trainingszeiten.findFirst({
      where: and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)),
    });
    if (!zeile) throw new Error("Trainingszeit nicht gefunden.");
    const fehler = pruefeTeilung(zeile.startMinuten, zeile.endMinuten, teil);
    if (fehler) throw new Error(fehler);
    await pruefeAbteilNummer(tx, zeile.halleId, zweitesAbteil);

    await tx.update(trainingszeiten).set({ endMinuten: teil }).where(eq(trainingszeiten.id, zeile.id));
    await tx.insert(trainingszeiten).values({
      vereinId: vereinId!,
      mannschaftId: zeile.mannschaftId,
      halleId: zeile.halleId,
      wochentag: zeile.wochentag,
      startMinuten: teil,
      endMinuten: zeile.endMinuten,
      farbe: zeile.farbe,
      abteilNummer: zweitesAbteil ?? zeile.abteilNummer,
    });
  });

  revalidatePath("/admin/trainingsplan");
}

// Tauscht die MANNSCHAFTEN zweier Trainingszeiten (Zeit, Halle und Abteil bleiben, jede Mannschaft übernimmt den Platz der anderen) — so tauschen
// zwei Teams Hallenseite oder Viertel, oder ihre Abschnitte im Wechsel. Die Farbe wandert mit der Mannschaft.
export async function trainingszeitenTauschen(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const idA = formData.get("idA");
  const idB = formData.get("idB");
  if (typeof idA !== "string" || !idA || typeof idB !== "string" || !idB || idA === idB) {
    throw new Error("Bitte zwei verschiedene Trainingszeiten wählen.");
  }

  await withTenant(vereinId!, async (tx) => {
    const [a, b] = await Promise.all([
      tx.query.trainingszeiten.findFirst({ where: and(eq(trainingszeiten.id, idA), eq(trainingszeiten.vereinId, vereinId!)) }),
      tx.query.trainingszeiten.findFirst({ where: and(eq(trainingszeiten.id, idB), eq(trainingszeiten.vereinId, vereinId!)) }),
    ]);
    if (!a || !b) throw new Error("Trainingszeit nicht gefunden.");
    await tx.update(trainingszeiten).set({ mannschaftId: b.mannschaftId, farbe: b.farbe }).where(eq(trainingszeiten.id, a.id));
    await tx.update(trainingszeiten).set({ mannschaftId: a.mannschaftId, farbe: a.farbe }).where(eq(trainingszeiten.id, b.id));
  });

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
  const abteilNummer = parseAbteilNummerRoh(formData);
  const farbe = formData.get("farbe");
  if (typeof farbe !== "string" || !/^#[0-9a-fA-F]{6}$/.test(farbe)) {
    throw new Error("Ungültige Farbe.");
  }

  await withTenant(vereinId!, async (tx) => {
    await pruefeAbteilNummer(tx, halleId, abteilNummer);
    await tx
      .update(trainingszeiten)
      .set({ mannschaftId, halleId, wochentag, startMinuten, endMinuten, farbe, abteilNummer })
      .where(and(eq(trainingszeiten.id, id), eq(trainingszeiten.vereinId, vereinId!)));
  });

  revalidatePath("/admin/trainingsplan");
}

// Sichtbares Zeitfenster des Wochenrasters (siehe TrainingsplanWoche) — nur
// volle Stunden (0-23), gespeichert als Minuten seit Mitternacht
// (vereine.trainingsplanStartMinuten/-EndMinuten) konsistent mit den
// Trainingszeiten selbst. Bestehende Trainingszeiten außerhalb des neuen
// Fensters bleiben unangetastet, werden im Grid nur am Rand abgeschnitten
// dargestellt (siehe GRID_START_MINUTEN-Kommentar in TrainingsplanWoche).
export async function trainingsplanZeitfensterSpeichern(formData: FormData) {
  const { vereinId } = (await requireAdminSchreibzugriff()).user;

  const startStunde = Number(formData.get("startStunde"));
  const endStunde = Number(formData.get("endStunde"));
  if (
    !Number.isInteger(startStunde) ||
    !Number.isInteger(endStunde) ||
    startStunde < 0 ||
    startStunde > 23 ||
    endStunde < 1 ||
    endStunde > 24 ||
    endStunde <= startStunde
  ) {
    throw new Error(
      "Ungültiges Zeitfenster — die Endzeit muss nach der Startzeit liegen."
    );
  }

  await withTenant(vereinId!, (tx) =>
    tx
      .update(vereine)
      .set({
        trainingsplanStartMinuten: startStunde * 60,
        trainingsplanEndMinuten: endStunde * 60,
      })
      .where(eq(vereine.id, vereinId!))
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
