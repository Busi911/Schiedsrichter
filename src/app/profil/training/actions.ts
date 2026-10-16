"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, hallen, mannschaften, trainingAusfaelle, trainingBelegungen, trainingszeiten } from "@/db/schema";
import { abteilLabel, istInSaison } from "@/lib/trainingsplan";
import { berlinJetzt, darfAusfallMelden, pruefeAusfallDatum } from "@/lib/training-ausfall";
import { sendeTrainingAusfallHinweise } from "@/lib/training-ausfall-mail";
import { ausfallRuecknahmeErlaubt, darfBelegen, darfBelegungAufheben } from "@/lib/training-belegung";
import { sendeTrainingBelegungHinweise } from "@/lib/training-belegung-mail";

const mannschaftLabel = (m: { name: string; altersklasse: string | null } | undefined) => (m ? (m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name) : "Mannschaft");

// Lädt die Trainingszeit samt Mannschaften, Halle und den Trainer-Rollen der angemeldeten Person (ohne Berechtigungsprüfung).
async function ladeTraining(trainingszeitId: string) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const geladen = await withTenant(vereinId, async (tx) => {
    const zeit = await tx.query.trainingszeiten.findFirst({
      where: and(eq(trainingszeiten.id, trainingszeitId), eq(trainingszeiten.vereinId, vereinId)),
    });
    if (!zeit) return null;
    const [alleMannschaften, halle, rollen] = await Promise.all([
      tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId), columns: { id: true, name: true, altersklasse: true } }),
      tx.query.hallen.findFirst({ where: eq(hallen.id, zeit.halleId) }),
      tx.query.funktionstraegerRollen.findMany({
        where: and(eq(funktionstraegerRollen.userId, session.user.id), eq(funktionstraegerRollen.typ, "trainer"), eq(funktionstraegerRollen.aktiv, true)),
        columns: { mannschaftId: true },
      }),
    ]);
    return { zeit, alleMannschaften, halle, trainerMannschaftIds: rollen.flatMap((r) => (r.mannschaftId ? [r.mannschaftId] : [])) };
  });
  if (!geladen) throw new Error("Training nicht gefunden.");
  const { zeit, halle, alleMannschaften } = geladen;
  const ort = halle ? (zeit.abteilNummer ? `${halle.name}, ${abteilLabel(halle, zeit.abteilNummer)}` : halle.name) : "Halle";
  return {
    session,
    vereinId,
    ...geladen,
    ort,
    rechte: { istAdmin: session.user.istAdmin, trainerMannschaftIds: geladen.trainerMannschaftIds },
    label: (id: string) => mannschaftLabel(alleMannschaften.find((m) => m.id === id)),
    datumFehler: (datum: string) => pruefeAusfallDatum(zeit, datum, new Date(), halle ? istInSaison(halle, datum) : true),
  };
}

function leseTrainingFelder(formData: FormData) {
  const trainingszeitId = formData.get("trainingszeitId");
  const datum = formData.get("datum");
  if (typeof trainingszeitId !== "string" || !trainingszeitId || typeof datum !== "string") throw new Error("Training fehlt.");
  return { trainingszeitId, datum };
}

// Ausfall melden/zurücknehmen: Admin oder Trainer DIESER Mannschaft, Datum gültig (richtiger Wochentag, nicht vorbei, in der Saison).
async function pruefeUndLade(formData: FormData) {
  const { trainingszeitId, datum } = leseTrainingFelder(formData);
  const k = await ladeTraining(trainingszeitId);
  if (!darfAusfallMelden({ istAdmin: k.rechte.istAdmin, trainerMannschaftIds: k.trainerMannschaftIds, mannschaftId: k.zeit.mannschaftId })) {
    throw new Error("Nur Admins und Trainer dieser Mannschaft dürfen Ausfälle melden.");
  }
  const fehler = k.datumFehler(datum);
  if (fehler) throw new Error(fehler);

  const mailDaten = {
    mannschaft: k.label(k.zeit.mannschaftId),
    halle: k.ort,
    datum,
    startMinuten: k.zeit.startMinuten,
    endMinuten: k.zeit.endMinuten,
  };
  return { k, session: k.session, vereinId: k.vereinId, trainingszeitId, datum, mailDaten };
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

// Ausfall zurücknehmen: das Training findet doch statt, die Halle ist wieder belegt (kurze Info-Mail an dieselben Trainer). Ist die freie Zeit schon von einer anderen
// Mannschaft gebucht, entscheidet ein Admin (dann entfällt die Belegung und die buchende Mannschaft erfährt es); Trainer bekommen eine Fehlermeldung.
export async function trainingAusfallZuruecknehmen(formData: FormData) {
  const { k, session, vereinId, trainingszeitId, datum, mailDaten } = await pruefeUndLade(formData);
  const belegung = await withTenant(vereinId, (tx) =>
    tx.query.trainingBelegungen.findFirst({ where: and(eq(trainingBelegungen.trainingszeitId, trainingszeitId), eq(trainingBelegungen.datum, datum)) })
  );
  if (!ausfallRuecknahmeErlaubt(!!belegung, k.rechte.istAdmin)) {
    throw new Error(`Diese Zeit ist schon von ${k.label(belegung!.mannschaftId)} belegt. Bitte den Admin fragen, ob die Belegung entfallen kann.`);
  }
  const geloescht = await withTenant(vereinId, async (tx) => {
    if (belegung) await tx.delete(trainingBelegungen).where(eq(trainingBelegungen.id, belegung.id));
    return tx
      .delete(trainingAusfaelle)
      .where(and(eq(trainingAusfaelle.trainingszeitId, trainingszeitId), eq(trainingAusfaelle.datum, datum), eq(trainingAusfaelle.vereinId, vereinId)))
      .returning({ id: trainingAusfaelle.id });
  });
  if (geloescht.length > 0) {
    after(async () => {
      await sendeTrainingAusfallHinweise(vereinId, { ...mailDaten, grund: null, art: "findet_statt" }, session.user.id);
      if (belegung) {
        await sendeTrainingBelegungHinweise(
          vereinId,
          { halle: k.ort, datum, startMinuten: k.zeit.startMinuten, endMinuten: k.zeit.endMinuten, ausfallMannschaft: mailDaten.mannschaft, belegtVon: k.label(belegung.mannschaftId), notiz: belegung.notiz, variante: "entfaellt" },
          { art: "mannschaften", mannschaftIds: [belegung.mannschaftId], mitAdmins: false },
          session.user.id
        );
      }
    });
  }
  revalidatePath("/profil/training");
}

// Eine frei gewordene Zeit für eine andere Mannschaft belegen: Admin für jede andere Mannschaft, Trainer für ihre eigenen. Wer zuerst bucht, bekommt die Zeit (der
// Unique-Index je Trainingszeit und Datum entscheidet auch bei gleichzeitigen Buchungen). Die ausfallende Mannschaft (Trainer) und die Admins bekommen eine Info-Mail.
export async function trainingBelegen(formData: FormData) {
  const { trainingszeitId, datum } = leseTrainingFelder(formData);
  const zielRoh = formData.get("mannschaftId");
  if (typeof zielRoh !== "string" || !zielRoh) throw new Error("Bitte die Mannschaft wählen, die die Zeit nutzt.");
  const notizRoh = formData.get("notiz");
  const notiz = typeof notizRoh === "string" && notizRoh.trim() ? notizRoh.trim().slice(0, 200) : null;

  const k = await ladeTraining(trainingszeitId);
  const fehler = k.datumFehler(datum);
  if (fehler) throw new Error(fehler);
  if (!darfBelegen(k.rechte, k.alleMannschaften.map((m) => m.id), k.zeit.mannschaftId, zielRoh)) {
    throw new Error("Du darfst diese Zeit nicht für diese Mannschaft belegen (Admins für jede andere Mannschaft, Trainer für ihre eigenen).");
  }
  const vereinId = k.vereinId;

  const ergebnis = await withTenant(vereinId, async (tx) => {
    const ausfall = await tx.query.trainingAusfaelle.findFirst({ where: and(eq(trainingAusfaelle.trainingszeitId, trainingszeitId), eq(trainingAusfaelle.datum, datum)) });
    if (!ausfall) return "kein_ausfall" as const;
    const eingefuegt = await tx
      .insert(trainingBelegungen)
      .values({ vereinId, trainingszeitId, datum, mannschaftId: zielRoh, notiz, gebuchtVon: k.session.user.id })
      .onConflictDoNothing()
      .returning({ id: trainingBelegungen.id });
    return eingefuegt.length > 0 ? ("gebucht" as const) : ("vergeben" as const);
  });
  if (ergebnis === "kein_ausfall") throw new Error("Für diese Zeit ist kein Training ausgefallen.");
  if (ergebnis === "vergeben") throw new Error("Schade: Diese Zeit hat gerade jemand anderes belegt.");

  after(() =>
    sendeTrainingBelegungHinweise(
      vereinId,
      { halle: k.ort, datum, startMinuten: k.zeit.startMinuten, endMinuten: k.zeit.endMinuten, ausfallMannschaft: k.label(k.zeit.mannschaftId), belegtVon: k.label(zielRoh), notiz, variante: "belegt" },
      { art: "mannschaften", mannschaftIds: [k.zeit.mannschaftId], mitAdmins: true },
      k.session.user.id
    )
  );
  revalidatePath("/profil/training");
  revalidatePath("/profil");
}

// Belegung aufheben (Admin oder Trainer der buchenden Mannschaft): die Zeit ist wieder frei, alle Trainer erfahren es (wie beim Ausfall).
export async function trainingBelegungAufheben(formData: FormData) {
  const id = formData.get("belegungId");
  if (typeof id !== "string" || !id) throw new Error("Belegung fehlt.");
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const belegung = await withTenant(vereinId, (tx) => tx.query.trainingBelegungen.findFirst({ where: and(eq(trainingBelegungen.id, id), eq(trainingBelegungen.vereinId, vereinId)) }));
  if (!belegung) throw new Error("Belegung nicht gefunden.");
  const k = await ladeTraining(belegung.trainingszeitId);
  if (!darfBelegungAufheben(k.rechte, belegung.mannschaftId)) throw new Error("Nur Admins und Trainer der buchenden Mannschaft können die Belegung aufheben.");

  await withTenant(vereinId, (tx) => tx.delete(trainingBelegungen).where(eq(trainingBelegungen.id, id)));
  // Nur für künftige Zeiten lohnt eine Mail.
  if (belegung.datum >= berlinJetzt(new Date()).datum) {
    after(() =>
      sendeTrainingBelegungHinweise(
        vereinId,
        { halle: k.ort, datum: belegung.datum, startMinuten: k.zeit.startMinuten, endMinuten: k.zeit.endMinuten, ausfallMannschaft: k.label(k.zeit.mannschaftId), belegtVon: k.label(belegung.mannschaftId), notiz: belegung.notiz, variante: "wieder_frei" },
        { art: "alleTrainer" },
        session.user.id
      )
    );
  }
  revalidatePath("/profil/training");
  revalidatePath("/profil");
}
