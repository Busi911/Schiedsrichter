"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { zuordnungsMailInhalt } from "@/lib/zuordnung";
import { bedarfFuer } from "@/lib/dienste";
import { istOrdnerwart, ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";

type OrdnerRolle = (typeof ORDNER_ROLLEN)[number];

// Eigene, bewusst eng begrenzte Actions (siehe Kommentar in
// schiedsrichterwart/actions.ts) — der Ordnerwart darf NUR die Rollen
// "ordner"/"kioskdienst" zuordnen bzw. entfernen. Anders als Schiedsrichter/
// Zeitnehmer/Sekretär gibt es hier KEINE feste Gespann-Obergrenze — die
// Kapazität ist der konfigurierte Dienste-Bedarf (siehe bedarfFuer), exakt
// dieselbe Prüfung wie bei der Selbst-Anmeldung in profil/actions.ts.
async function requireOrdnerwartZugriff() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const berechtigt = await istOrdnerwart(vereinId, session.user.id);
  if (!berechtigt) {
    throw new Error("Keine Berechtigung als Ordner-/Kioskdienstwart.");
  }
  return { session, vereinId };
}

export async function ordnerZuordnen(formData: FormData) {
  const { vereinId } = await requireOrdnerwartZugriff();

  const terminId = formData.get("terminId");
  const auswahl = formData.get("personRolle");
  const ersetzeZuordnungIds = formData.getAll("ersetzeZuordnungId");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof auswahl !== "string" || !auswahl.includes("|")) {
    throw new Error("Bitte eine Person auswählen.");
  }
  const [userId, rolleRoh] = auswahl.split("|");
  if (!userId || !(ORDNER_ROLLEN as readonly string[]).includes(rolleRoh)) {
    throw new Error("Ungültige Auswahl.");
  }
  const rolle = rolleRoh as OrdnerRolle;

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
        (ORDNER_ROLLEN as readonly string[]).includes(
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

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, terminId),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) throw new Error("Verein nicht gefunden.");

    const bedarf = bedarfFuer(
      verein,
      termin.typ,
      rolle,
      termin.pflichtspiel,
      termin.freundschaftsTyp
    );
    const bestehende = await tx.query.terminZuordnungen.findMany({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (bestehende.length >= bedarf) {
      throw new Error("Für diesen Dienst sind bereits genug Personen eingetragen.");
    }

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "zugeordnet_durch_admin",
    });

    return {
      termin,
      email: person.email,
      vereinName: verein.name,
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

  revalidatePath("/profil/ordnerwart");
  revalidatePath("/admin/kalender");
}

export async function ordnerZuordnungEntfernen(formData: FormData) {
  const { vereinId } = await requireOrdnerwartZugriff();

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
      !(ORDNER_ROLLEN as readonly string[]).includes(zuordnung.funktionstraegerTyp)
    ) {
      throw new Error(
        "Zuordnung nicht gefunden oder keine Ordner-/Kioskdienst-Rolle."
      );
    }
    await tx
      .delete(terminZuordnungen)
      .where(eq(terminZuordnungen.id, zuordnungId));
  });

  revalidatePath("/profil/ordnerwart");
  revalidatePath("/admin/kalender");
}
