"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireAdminSchreibzugriff } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import {
  pruefeBesetzungsgrenze,
  ZUORDENBARE_TYPEN,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

export async function zuordnen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
    // userId kommt roh aus dem Formular (Dropdown zeigt zwar nur Personen
    // des eigenen Vereins, siehe holeZuordenbareFunktionstraeger, aber ein
    // manipulierter Request könnte eine beliebige userId schicken). "user"
    // hat bewusst KEIN RLS (siehe 0001_enable_rls_multi_tenant.sql) —
    // Mandantentrennung muss hier deshalb explizit geprüft werden, sonst
    // ließe sich eine Person eines fremden Vereins zuordnen (inkl.
    // Benachrichtigungs-Mail an sie).
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (vorhanden) return null;

    await pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle);

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "zugeordnet_durch_admin",
    });

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, terminId),
    });
    if (!termin) return null;

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });

    return { termin, email: person.email, vereinName: verein?.name ?? "HandballerPate" };
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungsMailInhalt(rolle, benachrichtigung.termin),
    };
    try {
      await sendMail(
        benachrichtigung.email,
        "Neue Termin-Zuordnung",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/admin/kalender");
}

// Zuordnung einer Person OHNE Zugang im System (z.B. Schiedsrichter eines
// anderen Vereins) — nur Name, kein Account, keine Benachrichtigung
// möglich. Bewusst eine eigene Action statt eine Erweiterung von
// `zuordnen`, damit im Formular klar zwischen "bekannte Person auswählen"
// und "Name ohne Login eintragen" unterschieden wird.
export async function externeZuordnung(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
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
      vereinId,
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

  revalidatePath("/admin/kalender");
}

export async function zuordnungEntfernen(formData: FormData) {
  const session = await requireAdminSchreibzugriff();
  const vereinId = session.user.vereinId!;

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, (tx) =>
    tx.delete(terminZuordnungen).where(eq(terminZuordnungen.id, zuordnungId))
  );

  revalidatePath("/admin/kalender");
}
