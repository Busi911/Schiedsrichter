"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users } from "@/db/schema";
import { ZUORDENBARE_TYPEN } from "@/lib/zuordnung";
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
