"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { pruefeBesetzungsgrenze, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;
type ZeitnehmerRolle = (typeof ZEITNEHMER_ROLLEN)[number];

// Eigene, bewusst eng begrenzte Actions (siehe Kommentar in
// schiedsrichterwart/actions.ts) — der Zeitnehmerwart darf NUR die Rollen
// "zeitnehmer"/"sekretaer" zuordnen bzw. entfernen.
async function requireZeitnehmerwartZugriff() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const berechtigt = await istZeitnehmerwart(vereinId, session.user.id);
  if (!berechtigt) {
    throw new Error("Keine Berechtigung als Zeitnehmerwart.");
  }
  return { session, vereinId };
}

export async function zeitnehmerZuordnen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const terminId = formData.get("terminId");
  // Kombiniert Person + Rolle in einem Wert ("userId|rolle") — dieselbe
  // Konvention wie im ursprünglichen admin/zuordnung (personTyp) und im
  // Kalender-Modal, da eine Person sowohl Zeitnehmer als auch Sekretär sein
  // kann und hier explizit gewählt werden muss, ALS welche Rolle sie diesem
  // Termin zugeordnet wird.
  const auswahl = formData.get("personRolle");
  const ersetzeZuordnungIds = formData.getAll("ersetzeZuordnungId");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof auswahl !== "string" || !auswahl.includes("|")) {
    throw new Error("Bitte eine Person auswählen.");
  }
  const [userId, rolleRoh] = auswahl.split("|");
  if (
    !userId ||
    !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    throw new Error("Ungültige Auswahl.");
  }
  const rolle = rolleRoh as ZeitnehmerRolle;

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    // userId kommt roh aus dem Formular — "user" hat bewusst KEIN RLS
    // (siehe 0001_enable_rls_multi_tenant.sql), Mandantentrennung muss hier
    // deshalb explizit geprüft werden.
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    for (const zuordnungId of ersetzeZuordnungIds) {
      if (typeof zuordnungId !== "string" || !zuordnungId) continue;
      const zuordnung = await tx.query.terminZuordnungen.findFirst({
        where: and(
          eq(terminZuordnungen.id, zuordnungId),
          eq(terminZuordnungen.terminId, terminId)
        ),
      });
      if (
        zuordnung &&
        (ZEITNEHMER_ROLLEN as readonly string[]).includes(
          zuordnung.funktionstraegerTyp
        )
      ) {
        await tx
          .delete(terminZuordnungen)
          .where(eq(terminZuordnungen.id, zuordnungId));
      }
    }

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

    return {
      termin,
      email: person.email,
      vereinName: verein?.name ?? "HandballerPate",
      rolle,
    };
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungsMailInhalt(benachrichtigung.rolle, benachrichtigung.termin),
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

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

export async function zeitnehmerZuordnungEntfernen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (
      !zuordnung ||
      !(ZEITNEHMER_ROLLEN as readonly string[]).includes(
        zuordnung.funktionstraegerTyp
      )
    ) {
      throw new Error(
        "Zuordnung nicht gefunden oder keine Zeitnehmer-/Sekretär-Rolle."
      );
    }
    await tx
      .delete(terminZuordnungen)
      .where(eq(terminZuordnungen.id, zuordnungId));
  });

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}
