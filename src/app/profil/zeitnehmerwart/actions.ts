"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users, vereine } from "@/db/schema";
import {
  pruefeBesetzungsgrenze,
  zuordnungEntferntInhalt,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import { istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { generiereOeffentlichenToken } from "@/lib/token";

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
    const vereinName = verein?.name ?? "HandballerPate";

    // Wer beim "Ersetzen" verdrängt wird, bekommt eine eigene Mail — nur
    // möglich, wenn die Person einen Account hat (ohne Login kein Empfänger).
    const entfernt: {
      email: string;
      rolle: ZeitnehmerRolle;
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
        !(ZEITNEHMER_ROLLEN as readonly string[]).includes(
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
            rolle: zuordnung.funktionstraegerTyp as ZeitnehmerRolle,
            termin,
            vereinName,
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

    await pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle);

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId,
      funktionstraegerTyp: rolle,
      quelle: "zugeordnet_durch_admin",
    });

    return {
      neu: { termin, email: person.email, vereinName, rolle },
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

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

// Zuordnung einer Person OHNE Zugang im System — siehe
// schiedsrichterOhneLoginZuordnen in schiedsrichterwart/actions.ts. Hier
// zusätzlich mit Rollenauswahl (zeitnehmer/sekretaer), da die
// Schiedsrichter-Variante nur eine einzige Rolle kennt.
export async function zeitnehmerOhneLoginZuordnen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const terminId = formData.get("terminId");
  const name = formData.get("name");
  const rolleRoh = formData.get("rolle");

  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin ist erforderlich.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Name ist erforderlich.");
  }
  if (
    typeof rolleRoh !== "string" ||
    !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    throw new Error("Bitte eine Rolle auswählen.");
  }
  const rolle = rolleRoh as ZeitnehmerRolle;

  await withTenant(vereinId, async (tx) => {
    await pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle);

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: null,
      externerName: name.trim(),
      funktionstraegerTyp: rolle,
      quelle: "zugeordnet_durch_admin",
    });
  });

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

export async function zeitnehmerZuordnungEntfernen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

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
      rolle: zuordnung.funktionstraegerTyp as ZeitnehmerRolle,
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

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

// Überschreibt den (aus den Vereinseinstellungen, siehe /admin/einstellungen,
// abgeleiteten) Zeitnehmer-/Sekretär-Bedarf für GENAU diesen Termin — z.B.
// wenn für ein bestimmtes Freundschaftsspiel ausnahmsweise doch keiner (oder
// mehr als sonst) gebraucht wird. Leeres Feld setzt den Override zurück auf
// "Standard" (null), siehe zeitnehmerBedarfOverride in db/schema.ts.
export async function zeitnehmerBedarfUeberschreiben(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const terminId = formData.get("terminId");
  const bedarfRoh = formData.get("bedarf");
  if (typeof terminId !== "string" || !terminId) {
    throw new Error("Termin fehlt.");
  }

  let bedarf: number | null = null;
  if (typeof bedarfRoh === "string" && bedarfRoh.trim()) {
    bedarf = Number.parseInt(bedarfRoh, 10);
    if (!Number.isFinite(bedarf) || bedarf < 0) {
      throw new Error("Bedarf muss eine Zahl ≥ 0 sein.");
    }
  }

  await withTenant(vereinId, (tx) =>
    tx
      .update(termine)
      .set({ zeitnehmerBedarfOverride: bedarf })
      .where(and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)))
  );

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
  revalidatePath("/admin/dienste");
}

// Aktiviert die öffentliche Selbsteintragung (siehe
// /zeitnehmer-eintragen/[token]) bzw. generiert einen neuen Link — dieselbe
// Funktion für "erstmals aktivieren" und "Link neu generieren" (der alte
// Link wird dabei ungültig), analog zu turnierLinkErneuern in
// admin/actions.ts.
export async function zeitnehmerSelbstanmeldungLinkErneuern() {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  await withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    await tx
      .update(vereine)
      .set({
        zeitnehmerSelbstanmeldungToken: generiereOeffentlichenToken(
          verein?.name ?? ""
        ),
      })
      .where(eq(vereine.id, vereinId));
  });

  revalidatePath("/profil/zeitnehmerwart");
}

export async function zeitnehmerSelbstanmeldungDeaktivieren() {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  await withTenant(vereinId, (tx) =>
    tx
      .update(vereine)
      .set({ zeitnehmerSelbstanmeldungToken: null })
      .where(eq(vereine.id, vereinId))
  );

  revalidatePath("/profil/zeitnehmerwart");
}

// Bestätigt (oder korrigiert) den Namensabgleich einer öffentlichen
// Selbsteintragung (siehe findeNamensVorschlag in lib/namens-abgleich.ts):
// verknüpft die bisher nur per externerName erfasste Zuordnung mit einer
// echten Person. userId kommt aus dem Formular — vorausgewählt mit dem
// automatischen Vorschlag (defaultValue in page.tsx), vom Wart aber frei
// änderbar, falls der Vorschlag falsch lag.
export async function zeitnehmerVorschlagBestaetigen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  const userId = formData.get("userId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }
  if (typeof userId !== "string" || !userId) {
    throw new Error("Bitte eine Person auswählen.");
  }

  const benachrichtigung = await withTenant(vereinId, async (tx) => {
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (
      !zuordnung ||
      !(ZEITNEHMER_ROLLEN as readonly string[]).includes(
        zuordnung.funktionstraegerTyp
      ) ||
      zuordnung.userId
    ) {
      throw new Error(
        "Zuordnung nicht gefunden, keine Zeitnehmer-/Sekretär-Rolle, oder bereits bestätigt."
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
      rolle: zuordnung.funktionstraegerTyp as ZeitnehmerRolle,
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
