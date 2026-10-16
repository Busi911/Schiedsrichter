"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, hallen, mannschaften, trainingAusfaelle, trainingszeiten } from "@/db/schema";
import { abteilLabel } from "@/lib/trainingsplan";
import { darfAusfallMelden, pruefeAusfallDatum } from "@/lib/training-ausfall";
import { sendeTrainingAusfallHinweise } from "@/lib/training-ausfall-mail";

// Lädt die Trainingszeit samt Mannschaft/Halle und prüft Berechtigung (Admin oder Trainer DIESER Mannschaft) und Datum.
async function pruefeUndLade(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const trainingszeitId = formData.get("trainingszeitId");
  const datum = formData.get("datum");
  if (typeof trainingszeitId !== "string" || !trainingszeitId || typeof datum !== "string") throw new Error("Training fehlt.");

  const geladen = await withTenant(vereinId, async (tx) => {
    const zeit = await tx.query.trainingszeiten.findFirst({
      where: and(eq(trainingszeiten.id, trainingszeitId), eq(trainingszeiten.vereinId, vereinId)),
    });
    if (!zeit) return null;
    const [mannschaft, halle, rollen] = await Promise.all([
      tx.query.mannschaften.findFirst({ where: eq(mannschaften.id, zeit.mannschaftId), columns: { name: true, altersklasse: true } }),
      tx.query.hallen.findFirst({ where: eq(hallen.id, zeit.halleId) }),
      tx.query.funktionstraegerRollen.findMany({
        where: and(eq(funktionstraegerRollen.userId, session.user.id), eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)),
        columns: { mannschaftId: true },
      }),
    ]);
    return { zeit, mannschaft, halle, trainerMannschaftIds: rollen.flatMap((r) => (r.mannschaftId ? [r.mannschaftId] : [])) };
  });
  if (!geladen) throw new Error("Training nicht gefunden.");
  if (!darfAusfallMelden({ istAdmin: session.user.istAdmin, trainerMannschaftIds: geladen.trainerMannschaftIds, mannschaftId: geladen.zeit.mannschaftId })) {
    throw new Error("Nur Admins und Trainer dieser Mannschaft dürfen Ausfälle melden.");
  }
  const fehler = pruefeAusfallDatum(geladen.zeit, datum, new Date());
  if (fehler) throw new Error(fehler);

  const mailDaten = {
    mannschaft: geladen.mannschaft ? (geladen.mannschaft.altersklasse ? `${geladen.mannschaft.name} (${geladen.mannschaft.altersklasse})` : geladen.mannschaft.name) : "Mannschaft",
    halle: geladen.halle
      ? geladen.zeit.abteilNummer
        ? `${geladen.halle.name}, ${abteilLabel(geladen.halle, geladen.zeit.abteilNummer)}`
        : geladen.halle.name
      : "Halle",
    datum,
    startMinuten: geladen.zeit.startMinuten,
    endMinuten: geladen.zeit.endMinuten,
  };
  return { session, vereinId, trainingszeitId, datum, mailDaten };
}

// Training fällt an einem Datum aus: Halle ist frei, alle Trainer des Vereins bekommen (außer sie haben es abgeschaltet) eine Info-Mail.
export async function trainingAusfallMelden(formData: FormData) {
  const { session, vereinId, trainingszeitId, datum, mailDaten } = await pruefeUndLade(formData);
  const grundRoh = formData.get("grund");
  const grund = typeof grundRoh === "string" && grundRoh.trim() ? grundRoh.trim().slice(0, 200) : null;

  const eingefuegt = await withTenant(vereinId, (tx) =>
    tx
      .insert(trainingAusfaelle)
      .values({ vereinId, trainingszeitId, datum, grund, gemeldetVon: session.user.id })
      .onConflictDoNothing()
      .returning({ id: trainingAusfaelle.id })
  );
  // Nur beim ersten Melden mailen (ein zweiter Klick/Doppelsendung löst nichts aus).
  if (eingefuegt.length > 0) {
    after(() => sendeTrainingAusfallHinweise(vereinId, { ...mailDaten, grund, art: "ausfall" }, session.user.id));
  }
  revalidatePath("/profil/training");
}

// Ausfall zurücknehmen: das Training findet doch statt, die Halle ist wieder belegt (kurze Info-Mail an dieselben Trainer).
export async function trainingAusfallZuruecknehmen(formData: FormData) {
  const { session, vereinId, trainingszeitId, datum, mailDaten } = await pruefeUndLade(formData);
  const geloescht = await withTenant(vereinId, (tx) =>
    tx
      .delete(trainingAusfaelle)
      .where(and(eq(trainingAusfaelle.trainingszeitId, trainingszeitId), eq(trainingAusfaelle.datum, datum), eq(trainingAusfaelle.vereinId, vereinId)))
      .returning({ id: trainingAusfaelle.id })
  );
  if (geloescht.length > 0) {
    after(() => sendeTrainingAusfallHinweise(vereinId, { ...mailDaten, grund: null, art: "findet_statt" }, session.user.id));
  }
  revalidatePath("/profil/training");
}
