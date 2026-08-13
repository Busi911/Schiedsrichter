"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { pruefeBesetzungsgrenze, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { istSchiedsrichterwart } from "@/lib/schiedsrichterwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

// Eigene, bewusst eng begrenzte Actions statt Wiederverwendung von
// /admin/zuordnung/actions.ts' zuordnen()/externeZuordnung() (die
// requireAdmin() voraussetzen und jede ZUORDENBARE_TYPEN-Rolle erlauben) —
// der Schiedsrichterwart darf NUR die Rolle "schiedsrichter" zuordnen bzw.
// entfernen, unabhängig davon, was ein manipulierter Request sonst
// versuchen würde.
async function requireSchiedsrichterwartZugriff() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const berechtigt = await istSchiedsrichterwart(vereinId, session.user.id);
  if (!berechtigt) {
    throw new Error("Keine Berechtigung als Schiedsrichterwart.");
  }
  return { session, vereinId };
}

export async function schiedsrichterZuordnen(formData: FormData) {
  const { vereinId } = await requireSchiedsrichterwartZugriff();

  const terminId = formData.get("terminId");
  const userId = formData.get("userId");
  // Bei einer Umbesetzung (siehe Formular in page.tsx) werden die IDs der
  // bisherigen Schiedsrichter-Zuordnungen mitgeschickt — die werden VOR dem
  // Zuordnen entfernt, statt die neue Person zusätzlich hinzuzufügen. Ohne
  // das würde "Umbesetzen" die alte Person nur ergänzen statt ersetzen.
  const ersetzeZuordnungIds = formData.getAll("ersetzeZuordnungId");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("Bitte einen Schiedsrichter auswählen.");
  }

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    // userId kommt roh aus dem Formular (Dropdown zeigt zwar nur aktive
    // Schiedsrichter des eigenen Vereins, ein manipulierter Request könnte
    // aber eine beliebige userId schicken). "user" hat bewusst KEIN RLS
    // (siehe 0001_enable_rls_multi_tenant.sql) — Mandantentrennung muss
    // hier deshalb explizit geprüft werden.
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    for (const zuordnungId of ersetzeZuordnungIds) {
      if (typeof zuordnungId !== "string" || !zuordnungId) continue;
      // Nur tatsächliche Schiedsrichter-Zuordnungen DIESES Termins löschen —
      // ein manipulierter Request könnte sonst versuchen, über dieses Feld
      // beliebige andere Zuordnungen zu entfernen.
      const zuordnung = await tx.query.terminZuordnungen.findFirst({
        where: and(
          eq(terminZuordnungen.id, zuordnungId),
          eq(terminZuordnungen.terminId, terminId),
          eq(terminZuordnungen.funktionstraegerTyp, "schiedsrichter")
        ),
      });
      if (zuordnung) {
        await tx
          .delete(terminZuordnungen)
          .where(eq(terminZuordnungen.id, zuordnungId));
      }
    }

    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, "schiedsrichter")
      ),
    });
    if (vorhanden) return null;

    await pruefeBesetzungsgrenze(tx, vereinId, terminId, "schiedsrichter");

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: "schiedsrichter",
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
    };
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungsMailInhalt("schiedsrichter", benachrichtigung.termin),
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

  revalidatePath("/profil/schiedsrichterwart");
  revalidatePath("/admin/kalender");
}

// Zuordnung einer Person OHNE Zugang im System (z.B. Gast-Schiri eines
// anderen Vereins) — nur Name, kein Account, keine Benachrichtigung
// möglich. War früher über die inzwischen entfernte allgemeine
// /admin/zuordnung-Seite abgedeckt (siehe externeZuordnung in
// admin/zuordnung/actions.ts); dort gibt es aber keine UI mehr dafür, daher
// hier als eigene, auf "schiedsrichter" begrenzte Variante.
export async function schiedsrichterOhneLoginZuordnen(formData: FormData) {
  const { vereinId } = await requireSchiedsrichterwartZugriff();

  const terminId = formData.get("terminId");
  const name = formData.get("name");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }

  await withTenant(vereinId, async (tx) => {
    await pruefeBesetzungsgrenze(tx, vereinId, terminId, "schiedsrichter");

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: null,
      externerName: name.trim(),
      funktionstraegerTyp: "schiedsrichter",
      quelle: "zugeordnet_durch_admin",
    });
  });

  revalidatePath("/profil/schiedsrichterwart");
  revalidatePath("/admin/kalender");
}

export async function schiedsrichterZuordnungEntfernen(formData: FormData) {
  const { vereinId } = await requireSchiedsrichterwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }

  await withTenant(vereinId, async (tx) => {
    // Sicherstellen, dass es sich TATSÄCHLICH um eine Schiedsrichter-
    // Zuordnung handelt, bevor gelöscht wird — der Schiedsrichterwart ist
    // nur für diese Rolle berechtigt, nicht für Ordner/Kioskdienst/
    // Zeitnehmer/Sekretär.
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (!zuordnung || zuordnung.funktionstraegerTyp !== "schiedsrichter") {
      throw new Error(
        "Zuordnung nicht gefunden oder keine Schiedsrichter-Rolle."
      );
    }
    await tx
      .delete(terminZuordnungen)
      .where(eq(terminZuordnungen.id, zuordnungId));
  });

  revalidatePath("/profil/schiedsrichterwart");
  revalidatePath("/admin/kalender");
}
