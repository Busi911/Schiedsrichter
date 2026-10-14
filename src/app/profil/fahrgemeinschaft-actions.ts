"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { dienstArten, fahrtMitfahrer, termine, terminZuordnungen } from "@/db/schema";
import { istDienstwart } from "@/lib/dienstwart";
import { mitfahrerMoeglich, pruefeFahrtHinweis, pruefeMitfahrerName, pruefePlaetze } from "@/lib/fahrgemeinschaft";

// Fahrgemeinschaft (lib/fahrgemeinschaft.ts): freie Plätze/Hinweis je Fahrer und Mitfahrer. Dürfen: Vereinsadmins, Dienstwarte und
// die eingeteilte Person selbst (für ihre eigene Fahrt, im Profil unter "Meine Helferdienste").

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

function aktualisiereSeiten() {
  revalidatePath("/profil");
  revalidatePath("/profil/dienstwart");
  revalidatePath("/admin/kalender");
}

// Lädt die Einteilung (nur in diesem Verein, nur bei einem Dienst mit Fahrgemeinschaft) und prüft die Berechtigung.
async function ladeFahrt(tx: Tx, vereinId: string, zuordnungId: string, session: Awaited<ReturnType<typeof requireSession>>) {
  const [z] = await tx
    .select({ id: terminZuordnungen.id, userId: terminZuordnungen.userId, plaetze: terminZuordnungen.plaetze, start: termine.start })
    .from(terminZuordnungen)
    .innerJoin(termine, eq(termine.id, terminZuordnungen.terminId))
    .innerJoin(dienstArten, eq(dienstArten.id, terminZuordnungen.dienstArtId))
    .where(
      and(
        eq(terminZuordnungen.id, zuordnungId),
        eq(termine.vereinId, vereinId),
        eq(dienstArten.vereinId, vereinId),
        eq(dienstArten.fahrgemeinschaft, true)
      )
    );
  if (!z) throw new Error("Fahrt nicht gefunden.");
  const selbst = !!z.userId && z.userId === session.user.id;
  if (!selbst && !session.user.istAdmin && !(await istDienstwart(vereinId, session.user.id))) {
    throw new Error("Keine Berechtigung für diese Fahrt.");
  }
  const [{ belegt }] = await tx
    .select({ belegt: count() })
    .from(fahrtMitfahrer)
    .where(and(eq(fahrtMitfahrer.zuordnungId, zuordnungId), eq(fahrtMitfahrer.vereinId, vereinId)));
  return { ...z, belegt: Number(belegt) };
}

export async function fahrtSpeichern(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const zuordnungId = text(formData, "zuordnungId");
  const plaetze = pruefePlaetze(text(formData, "plaetze"));
  const fahrtHinweis = pruefeFahrtHinweis(text(formData, "fahrtHinweis"));
  await withTenant(vereinId, async (tx) => {
    const fahrt = await ladeFahrt(tx, vereinId, zuordnungId, session);
    if ((plaetze ?? 0) < fahrt.belegt) {
      throw new Error(`Es fahren schon ${fahrt.belegt} mit. Bitte erst Mitfahrer entfernen.`);
    }
    await tx.update(terminZuordnungen).set({ plaetze, fahrtHinweis }).where(eq(terminZuordnungen.id, zuordnungId));
  });
  aktualisiereSeiten();
}

export async function mitfahrerHinzufuegen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const zuordnungId = text(formData, "zuordnungId");
  const name = pruefeMitfahrerName(text(formData, "name"));
  await withTenant(vereinId, async (tx) => {
    const fahrt = await ladeFahrt(tx, vereinId, zuordnungId, session);
    const vorhandene = await tx
      .select({ name: fahrtMitfahrer.name })
      .from(fahrtMitfahrer)
      .where(and(eq(fahrtMitfahrer.zuordnungId, zuordnungId), eq(fahrtMitfahrer.vereinId, vereinId)));
    if (!mitfahrerMoeglich({ plaetze: fahrt.plaetze, mitfahrer: vorhandene.map((v) => v.name) })) {
      throw new Error(fahrt.plaetze === null ? "Bitte zuerst die freien Plätze angeben." : "Alle Plätze sind belegt.");
    }
    if (vorhandene.some((v) => v.name.toLowerCase() === name.toLowerCase())) throw new Error(`${name} fährt hier schon mit.`);
    await tx.insert(fahrtMitfahrer).values({ zuordnungId, vereinId, name });
  });
  aktualisiereSeiten();
}

export async function mitfahrerEntfernen(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const mitfahrerId = text(formData, "mitfahrerId");
  await withTenant(vereinId, async (tx) => {
    const m = await tx.query.fahrtMitfahrer.findFirst({
      where: and(eq(fahrtMitfahrer.id, mitfahrerId), eq(fahrtMitfahrer.vereinId, vereinId)),
    });
    if (!m) throw new Error("Mitfahrer nicht gefunden.");
    await ladeFahrt(tx, vereinId, m.zuordnungId, session);
    await tx.delete(fahrtMitfahrer).where(and(eq(fahrtMitfahrer.id, mitfahrerId), eq(fahrtMitfahrer.vereinId, vereinId)));
  });
  aktualisiereSeiten();
}
