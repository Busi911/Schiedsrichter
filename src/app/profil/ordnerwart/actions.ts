"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { zuordnungEntferntInhalt, zuordnungsMailInhalt } from "@/lib/zuordnung";
import { bedarfFuer } from "@/lib/dienste";
import { istOrdnerwart, ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { generiereOeffentlichenToken } from "@/lib/token";

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

  const { neu, entfernt } = await withTenant(vereinId, async (tx) => {
    // userId kommt roh aus dem Formular — "user" hat bewusst KEIN RLS
    // (siehe 0001_enable_rls_multi_tenant.sql), Mandantentrennung muss hier
    // deshalb explizit geprüft werden.
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, terminId),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) throw new Error("Verein nicht gefunden.");

    // Wer beim "Ersetzen" verdrängt wird, bekommt eine eigene Mail — nur
    // möglich, wenn die Person einen Account hat (ohne Login kein Empfänger).
    const entfernt: {
      email: string;
      rolle: OrdnerRolle;
      termin: typeof termin;
      vereinName: string;
    }[] = [];
    for (const zuordnungId of ersetzeZuordnungIds) {
      if (typeof zuordnungId !== "string" || !zuordnungId) continue;
      const zuordnung = await tx.query.terminZuordnungen.findFirst({
        where: and(
          eq(terminZuordnungen.id, zuordnungId),
          eq(terminZuordnungen.terminId, terminId)
        ),
      });
      if (
        !zuordnung ||
        !(ORDNER_ROLLEN as readonly string[]).includes(
          zuordnung.funktionstraegerTyp
        )
      ) {
        continue;
      }
      await tx
        .delete(terminZuordnungen)
        .where(eq(terminZuordnungen.id, zuordnungId));

      if (zuordnung.userId) {
        const entfernteMitAccount = await tx.query.users.findFirst({
          where: eq(users.id, zuordnung.userId),
        });
        if (entfernteMitAccount) {
          entfernt.push({
            email: entfernteMitAccount.email,
            rolle: zuordnung.funktionstraegerTyp as OrdnerRolle,
            termin,
            vereinName: verein.name,
          });
        }
      }
    }

    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (vorhanden) return { neu: null, entfernt };

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
      neu: { termin, email: person.email, vereinName: verein.name, rolle },
      entfernt,
    };
  });

  if (neu) {
    const mailParams = {
      vereinName: neu.vereinName,
      ...zuordnungsMailInhalt(neu.rolle, neu.termin),
    };
    try {
      await sendMail(
        neu.email,
        "Neue Termin-Zuordnung",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }
  for (const e of entfernt) {
    const mailParams = {
      vereinName: e.vereinName,
      ...zuordnungEntferntInhalt(e.rolle, e.termin),
    };
    try {
      await sendMail(
        e.email,
        "Termin-Zuordnung entfernt",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Entfernungs-Mail konnte nicht gesendet werden:", err);
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

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
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

    if (!zuordnung.userId) return null; // ohne Login kein Empfänger

    const [person, termin, verein] = await Promise.all([
      tx.query.users.findFirst({ where: eq(users.id, zuordnung.userId) }),
      tx.query.termine.findFirst({ where: eq(termine.id, zuordnung.terminId) }),
      tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }),
    ]);
    if (!person || !termin) return null;

    return {
      termin,
      email: person.email,
      rolle: zuordnung.funktionstraegerTyp as OrdnerRolle,
      vereinName: verein?.name ?? "HandballerPate",
    };
  });

  if (benachrichtigung) {
    const mailParams = {
      vereinName: benachrichtigung.vereinName,
      ...zuordnungEntferntInhalt(benachrichtigung.rolle, benachrichtigung.termin),
    };
    try {
      await sendMail(
        benachrichtigung.email,
        "Termin-Zuordnung entfernt",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Entfernungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  revalidatePath("/profil/ordnerwart");
  revalidatePath("/admin/kalender");
}

// Analog zu zeitnehmerSelbstanmeldungLinkErneuern/-Deaktivieren in
// profil/zeitnehmerwart/actions.ts, aber für vereine.ordnerSelbstanmeldungToken
// (siehe /ordner-eintragen/[token]).
export async function ordnerSelbstanmeldungLinkErneuern() {
  const { vereinId } = await requireOrdnerwartZugriff();

  await withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    await tx
      .update(vereine)
      .set({
        ordnerSelbstanmeldungToken: generiereOeffentlichenToken(verein?.name ?? ""),
      })
      .where(eq(vereine.id, vereinId));
  });

  revalidatePath("/profil/ordnerwart");
}

export async function ordnerSelbstanmeldungDeaktivieren() {
  const { vereinId } = await requireOrdnerwartZugriff();

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({ ordnerSelbstanmeldungToken: null })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/profil/ordnerwart");
}

// Bestätigt (oder korrigiert) den Namensabgleich einer öffentlichen
// Selbsteintragung (siehe findeNamensVorschlag in lib/namens-abgleich.ts) —
// analog zu zeitnehmerVorschlagBestaetigen in profil/zeitnehmerwart/actions.ts,
// siehe dortige Kommentare.
export async function ordnerVorschlagBestaetigen(formData: FormData) {
  const { vereinId } = await requireOrdnerwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  const userId = formData.get("userId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("Bitte eine Person auswählen.");
  }

  const bestaetigung = await withTenant(vereinId, async (tx) => {
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (
      !zuordnung ||
      !(ORDNER_ROLLEN as readonly string[]).includes(zuordnung.funktionstraegerTyp) ||
      zuordnung.userId
    ) {
      throw new Error(
        "Zuordnung nicht gefunden, keine Ordner-/Kioskdienst-Rolle, oder bereits bestätigt."
      );
    }

    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
    });
    if (!person) throw new Error("Person nicht gefunden.");

    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, zuordnung.terminId),
        eq(terminZuordnungen.userId, userId),
        eq(terminZuordnungen.funktionstraegerTyp, zuordnung.funktionstraegerTyp)
      ),
    });
    if (vorhanden) {
      // Person ist für diese Rolle an diesem Termin bereits (anderweitig)
      // zugeordnet — die self-eingetragene Dublette entfernen statt einen
      // zweiten Eintrag für dieselbe Person/Rolle zu behalten.
      await tx
        .delete(terminZuordnungen)
        .where(eq(terminZuordnungen.id, zuordnungId));
      return null;
    }

    await tx
      .update(terminZuordnungen)
      .set({ userId, externerName: null, matchVorschlagUserId: null })
      .where(eq(terminZuordnungen.id, zuordnungId));

    const termin = await tx.query.termine.findFirst({
      where: eq(termine.id, zuordnung.terminId),
    });
    if (!termin) return null;

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });

    return {
      termin,
      email: person.email,
      vereinName: verein?.name ?? "HandballerPate",
      rolle: zuordnung.funktionstraegerTyp as OrdnerRolle,
    };
  });

  if (bestaetigung) {
    const mailParams = {
      vereinName: bestaetigung.vereinName,
      ...zuordnungsMailInhalt(bestaetigung.rolle, bestaetigung.termin),
    };
    try {
      await sendMail(
        bestaetigung.email,
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
