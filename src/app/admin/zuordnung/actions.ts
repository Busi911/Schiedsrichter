"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users } from "@/db/schema";
import { ZUORDENBARE_TYPEN } from "@/lib/zuordnung";
import {
  SCHIRI_GESPANN_MAX,
  ZEITNEHMER_SEKRETAER_MAX,
  berechneBesetzung,
} from "@/lib/besetzung";
import { sendMail } from "@/lib/mailer";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

function zuordnungsText(
  rolle: string,
  termin: { start: Date; ort: string | null; beschreibung: string | null }
) {
  const zeitpunkt = termin.start.toLocaleString("de-DE", {
    dateStyle: "full",
    timeStyle: "short",
  });
  const zeilen = [
    `Du wurdest als ${TYP_LABEL[rolle] ?? rolle} für den Termin am ${zeitpunkt} eingeteilt.`,
  ];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  return zeilen.join("\n");
}

// Prüft die Gespann-/Zweierbesetzung-Obergrenze, BEVOR eine weitere Person
// eingetragen wird — schiedsrichter max. 2 (Gespann), zeitnehmer+sekretaer
// zusammen max. 2. Wirft, wenn die Grenze für `rolle` bereits erreicht ist.
async function pruefeBesetzungsgrenze(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  terminId: string,
  rolle: (typeof ZUORDENBARE_TYPEN)[number]
) {
  const bestehende = await tx.query.terminZuordnungen.findMany({
    where: eq(terminZuordnungen.terminId, terminId),
  });
  const status = berechneBesetzung(bestehende);
  if (rolle === "schiedsrichter" && status.schiriVoll) {
    throw new Error(
      `Es sind bereits ${SCHIRI_GESPANN_MAX} Schiedsrichter (Gespann-Maximum) zugeordnet.`
    );
  }
  if (
    (rolle === "zeitnehmer" || rolle === "sekretaer") &&
    status.zeitnehmerSekretaerVoll
  ) {
    throw new Error(
      `Es sind bereits ${ZEITNEHMER_SEKRETAER_MAX} Zeitnehmer/Sekretäre zugeordnet.`
    );
  }
}

export async function zuordnen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const auswahl = formData.get("personTyp");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof auswahl !== "string" || !auswahl.includes("|")) {
    throw new Error("Bitte eine Person auswählen.");
  }
  const [userId, typ] = auswahl.split("|");
  if (!(ZUORDENBARE_TYPEN as readonly string[]).includes(typ)) {
    throw new Error("Ungültige Rolle.");
  }
  const rolle = typ as (typeof ZUORDENBARE_TYPEN)[number];

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (vorhanden) return null;

    await pruefeBesetzungsgrenze(tx, terminId, rolle);

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "zugeordnet_durch_admin",
    });

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, terminId),
    });
    const person = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!termin || !person) return null;

    return { termin, email: person.email };
  });

  if (benachrichtigung) {
    try {
      await sendMail(
        benachrichtigung.email,
        "Neue Termin-Zuordnung",
        zuordnungsText(rolle, benachrichtigung.termin)
      );
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/zuordnung");
}

// Zuordnung einer Person OHNE Zugang im System (z.B. Schiedsrichter eines
// anderen Vereins) — nur Name, kein Account, keine Benachrichtigung
// möglich. Bewusst eine eigene Action statt eine Erweiterung von
// `zuordnen`, damit im Formular klar zwischen "bekannte Person auswählen"
// und "Name ohne Login eintragen" unterschieden wird.
export async function externeZuordnung(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const terminId = formData.get("terminId");
  const rolle = formData.get("rolle");
  const name = formData.get("name");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (
    typeof rolle !== "string" ||
    !(ZUORDENBARE_TYPEN as readonly string[]).includes(rolle)
  ) {
    throw new Error("Ungültige Rolle.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId, async (tx) => {
    await pruefeBesetzungsgrenze(
      tx,
      terminId,
      rolle as (typeof ZUORDENBARE_TYPEN)[number]
    );

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: null,
      externerName: name.trim(),
      funktionstraegerTyp: rolle as (typeof ZUORDENBARE_TYPEN)[number],
      quelle: "zugeordnet_durch_admin",
    });
  });

  revalidatePath("/admin/zuordnung");
}

export async function zuordnungEntfernen(formData: FormData) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(terminZuordnungen).where(eq(terminZuordnungen.id, zuordnungId))
  );

  revalidatePath("/admin/zuordnung");
}
