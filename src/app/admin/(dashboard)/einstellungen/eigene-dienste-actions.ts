"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { dienstArten, dienstArtMannschaften, mannschaften, terminZuordnungen } from "@/db/schema";
import { pruefeBedarf, pruefeDienstName } from "@/lib/eigene-dienste";

// Einstellungen → "Eigene Dienste" (Fahrer, Kuchen, ...). Regeln in lib/eigene-dienste.ts.

function haken(formData: FormData, feld: string): boolean {
  return formData.get(feld) === "on";
}

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function aktualisiereSeiten() {
  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin");
  revalidatePath("/admin/kalender");
  revalidatePath("/admin/dienste");
  revalidatePath("/profil/dienstwart");
}

// Neu anlegen (ohne id) oder ändern (mit id).
export async function dienstArtSpeichern(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id") || null;

  const beschreibung = text(formData, "beschreibung").slice(0, 300) || null;
  const standardBedarf = pruefeBedarf(text(formData, "standardBedarf"));
  const nurAusgewaehlteMannschaften = formData.get("mannschaftsModus") === "auswahl";
  const gewaehlteMannschaften = formData.getAll("mannschaftIds").filter((m): m is string => typeof m === "string" && !!m);
  const geltung = {
    fuerHeimspiele: haken(formData, "fuerHeimspiele"),
    fuerFreundschaftsspiele: haken(formData, "fuerFreundschaftsspiele"),
    fuerTurniere: haken(formData, "fuerTurniere"),
  };
  if (!geltung.fuerHeimspiele && !geltung.fuerFreundschaftsspiele && !geltung.fuerTurniere && !haken(formData, "fuerAuswaertsspiele")) {
    throw new Error("Bitte mindestens eine Veranstaltung wählen, für die der Dienst gilt.");
  }

  await withTenant(vereinId, async (tx) => {
    const andere = await tx
      .select({ name: dienstArten.name })
      .from(dienstArten)
      .where(id ? and(eq(dienstArten.vereinId, vereinId), ne(dienstArten.id, id)) : eq(dienstArten.vereinId, vereinId));
    const name = pruefeDienstName(text(formData, "name"), andere.map((a) => a.name));

    // Nur Mannschaften dieses Vereins übernehmen (RLS + ausdrücklicher Filter).
    const mannschaftIds = gewaehlteMannschaften.length
      ? (
          await tx
            .select({ id: mannschaften.id })
            .from(mannschaften)
            .where(and(eq(mannschaften.vereinId, vereinId), inArray(mannschaften.id, gewaehlteMannschaften)))
        ).map((m) => m.id)
      : [];
    if (nurAusgewaehlteMannschaften && mannschaftIds.length === 0) {
      throw new Error("Bitte mindestens eine Mannschaft auswählen oder „alle Mannschaften“ wählen.");
    }

    const werte = {
      name,
      beschreibung,
      standardBedarf,
      nurAusgewaehlteMannschaften,
      ...geltung,
      fuerAuswaertsspiele: haken(formData, "fuerAuswaertsspiele"),
    };
    let dienstArtId = id;
    if (id) {
      const [geaendert] = await tx
        .update(dienstArten)
        .set(werte)
        .where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)))
        .returning({ id: dienstArten.id });
      if (!geaendert) throw new Error("Dienst nicht gefunden.");
    } else {
      const [{ anzahl }] = await tx.select({ anzahl: count() }).from(dienstArten).where(eq(dienstArten.vereinId, vereinId));
      if (anzahl >= 20) throw new Error("Es sind höchstens 20 eigene Dienste möglich.");
      const [neu] = await tx
        .insert(dienstArten)
        .values({ vereinId, ...werte, reihenfolge: anzahl })
        .returning({ id: dienstArten.id });
      dienstArtId = neu.id;
    }

    await tx
      .delete(dienstArtMannschaften)
      .where(and(eq(dienstArtMannschaften.dienstArtId, dienstArtId!), eq(dienstArtMannschaften.vereinId, vereinId)));
    if (nurAusgewaehlteMannschaften) {
      await tx
        .insert(dienstArtMannschaften)
        .values(mannschaftIds.map((mannschaftId) => ({ dienstArtId: dienstArtId!, mannschaftId, vereinId })));
    }
  });

  aktualisiereSeiten();
}

// Deaktivieren statt löschen, sobald ein Dienst schon eingeteilt wurde: die Einteilungen bleiben sichtbar, es entsteht kein neuer Bedarf.
export async function dienstArtAktivSetzen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  const aktiv = formData.get("aktiv") === "true";
  await withTenant(vereinId, (tx) =>
    tx.update(dienstArten).set({ aktiv }).where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)))
  );
  aktualisiereSeiten();
}

// Löschen nur, solange niemand für den Dienst eingeteilt ist (sonst gingen die Einteilungen mit verloren).
export async function dienstArtLoeschen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;
  const id = text(formData, "id");
  await withTenant(vereinId, async (tx) => {
    const [{ anzahl }] = await tx
      .select({ anzahl: count() })
      .from(terminZuordnungen)
      .where(eq(terminZuordnungen.dienstArtId, id));
    if (anzahl > 0) {
      throw new Error("Für diesen Dienst sind schon Personen eingeteilt. Bitte deaktivieren statt löschen, damit die Einteilungen erhalten bleiben.");
    }
    await tx.delete(dienstArten).where(and(eq(dienstArten.id, id), eq(dienstArten.vereinId, vereinId)));
  });
  aktualisiereSeiten();
}
