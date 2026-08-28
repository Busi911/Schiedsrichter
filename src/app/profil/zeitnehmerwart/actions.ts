"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import {
  pruefeBesetzungsgrenze,
  zuordnungEntferntInhalt,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import { istZeitnehmerwart } from "@/lib/zeitnehmerwart";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { generiereOeffentlichenToken } from "@/lib/token";
import { vergebeEinmalPasswortFallsNoetig } from "@/lib/passwort";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";

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

// Für Selbsteintragungen, zu denen weder eine aktive noch eine deaktivierte
// Rolle passt (siehe kandidaten/inaktivVorschlag in page.tsx) — statt den
// Umweg über /admin/funktionstraeger zu erzwingen, legt diese Action direkt
// eine neue Person mit einer vom Wart eingegebenen E-Mail an (Platzhalter
// reicht, falls die Person keine echte hinterlegen mag/kann) und bestätigt
// die Zuordnung in einem Schritt. Anders als createFunktionstraeger in
// admin/actions.ts bewusst OHNE Willkommens-Mail: die Person hat sich ja
// bereits per Namenseintrag gemeldet, nicht über einen Login — ein
// Zustellversuch an eine reine Platzhalter-Adresse würde nur verwirren oder
// fehlschlagen. Die Rolle ist sofort aktiv, damit die Person direkt
// auswählbar ist (auch bei künftigen Selbsteintragungen/Zuordnungen). Kein
// pruefeBesetzungsgrenze-Aufruf nötig: die unbestätigte Selbsteintragung
// zählt für ihre Rolle bereits als bestehende Zuordnung (siehe
// berechneBesetzung in besetzung.ts, das nicht nach userId unterscheidet) —
// hier wird ihr nur eine Identität zugewiesen, kein neuer Platz verbraucht
// (exakt wie in zeitnehmerVorschlagBestaetigen oben).
export async function zeitnehmerNeuAnlegenUndBestaetigen(formData: FormData) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  const email = formData.get("email");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("E-Mail ist erforderlich.");
  }
  const normalizedEmail = email.trim().toLowerCase();

  await withTenant(vereinId, async (tx) => {
    const zuordnung = await tx.query.terminZuordnungen.findFirst({
      where: eq(terminZuordnungen.id, zuordnungId),
    });
    if (
      !zuordnung ||
      !(ZEITNEHMER_ROLLEN as readonly string[]).includes(
        zuordnung.funktionstraegerTyp
      ) ||
      zuordnung.userId ||
      !zuordnung.externerName
    ) {
      throw new Error(
        "Zuordnung nicht gefunden, keine Zeitnehmer-/Sekretär-Rolle, oder bereits bestätigt."
      );
    }
    const rolle = zuordnung.funktionstraegerTyp as ZeitnehmerRolle;

    let person = await tx.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });
    if (person && person.vereinId !== vereinId) {
      throw new Error(
        "Diese E-Mail-Adresse ist bereits einem anderen Verein zugeordnet."
      );
    }
    if (!person) {
      [person] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          name: zuordnung.externerName,
          vereinId,
        })
        .returning();
    }

    const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, person.id),
        eq(funktionstraegerRollen.typ, rolle)
      ),
    });
    if (!vorhandeneRolle) {
      await tx.insert(funktionstraegerRollen).values({
        userId: person.id,
        typ: rolle,
        aktiv: true,
      });
    } else if (!vorhandeneRolle.aktiv) {
      await tx
        .update(funktionstraegerRollen)
        .set({ aktiv: true })
        .where(eq(funktionstraegerRollen.id, vorhandeneRolle.id));
    }

    // Wie in zeitnehmerVorschlagBestaetigen: ist die (wiederverwendete)
    // Person für diese Rolle an diesem Termin bereits anderweitig
    // zugeordnet, wird die self-eingetragene Dublette entfernt statt einen
    // zweiten Eintrag zu behalten.
    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, zuordnung.terminId),
        eq(terminZuordnungen.userId, person.id),
        eq(terminZuordnungen.funktionstraegerTyp, rolle)
      ),
    });
    if (vorhanden) {
      await tx
        .delete(terminZuordnungen)
        .where(eq(terminZuordnungen.id, zuordnungId));
    } else {
      await tx
        .update(terminZuordnungen)
        .set({ userId: person.id, externerName: null, matchVorschlagUserId: null })
        .where(eq(terminZuordnungen.id, zuordnungId));
    }
  });

  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
  revalidatePath("/admin/funktionstraeger");
}

// Siehe willkommensInhalt in admin/actions.ts — dort nicht exportiert (in
// einer "use server"-Datei dürfen nur async-Funktionen exportiert werden),
// deshalb hier dupliziert statt importiert; inhaltlich identisch.
function willkommensInhalt(
  vereinName: string,
  email: string,
  einmalPasswort: string | null
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: "Für dich wurde ein Zugang angelegt.",
    zeilen: einmalPasswort
      ? [
          `Melde dich mit deiner E-Mail-Adresse (${email}) und dem folgenden Einmal-Passwort an.`,
          `Einmal-Passwort: ${einmalPasswort}`,
          "Direkt nach dem ersten Login musst du ein eigenes Passwort vergeben. Alternativ kannst du dich jederzeit auch ohne Passwort per Login-Link einloggen.",
        ]
      : [
          `Melde dich mit deiner E-Mail-Adresse (${email}) an — du bekommst dort einen Login-Link per E-Mail zugeschickt.`,
        ],
    cta: { text: "Jetzt einloggen", url: `${appUrl()}/login` },
  };
}

// Für Selbsteintragungen, zu denen KEINE aktive Person passte, aber laut
// Namensabgleich eine bereits angelegte, nur DEAKTIVIERTE Zeitnehmer-/
// Sekretär-Rolle (siehe holeInaktiveZeitnehmerKandidaten und die
// Vorschlagsberechnung in page.tsx) — aktiviert diese Rolle und bestätigt
// die Zuordnung in einem Schritt, statt den Umweg über
// /admin/funktionstraeger zu erzwingen. Bewusst auf ZEITNEHMER_ROLLEN
// begrenzt wie der Rest dieser Datei — andere Rollentypen aktiviert
// weiterhin nur der Admin.
export async function zeitnehmerInaktiveRolleAktivierenUndZuordnen(
  formData: FormData
) {
  const { vereinId } = await requireZeitnehmerwartZugriff();

  const zuordnungId = formData.get("zuordnungId");
  const rolleId = formData.get("rolleId");
  if (typeof zuordnungId !== "string" || !zuordnungId) {
    throw new Error("Zuordnung fehlt.");
  }
  if (typeof rolleId !== "string" || !rolleId) {
    throw new Error("Rolle fehlt.");
  }

  const ergebnis = await withTenant(vereinId, async (tx) => {
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

    const rolle = await tx
      .select({
        typ: funktionstraegerRollen.typ,
        aktiv: funktionstraegerRollen.aktiv,
        userId: funktionstraegerRollen.userId,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(eq(funktionstraegerRollen.id, rolleId), eq(users.vereinId, vereinId))
      )
      .then((r) => r[0]);
    if (
      !rolle ||
      !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolle.typ) ||
      rolle.typ !== zuordnung.funktionstraegerTyp
    ) {
      throw new Error("Rolle nicht gefunden oder passt nicht zur Zuordnung.");
    }

    const warInaktiv = !rolle.aktiv;
    if (warInaktiv) {
      await tx
        .update(funktionstraegerRollen)
        .set({ aktiv: true })
        .where(eq(funktionstraegerRollen.id, rolleId));
    }
    const einmalPasswort = warInaktiv
      ? await vergebeEinmalPasswortFallsNoetig(tx, rolle.userId, rolle.passwordHash)
      : null;

    // Wie in zeitnehmerVorschlagBestaetigen: ist die Person für diese Rolle
    // an diesem Termin bereits (anderweitig) zugeordnet, wird die
    // self-eingetragene Dublette entfernt statt einen zweiten Eintrag zu
    // behalten.
    const vorhanden = await tx.query.terminZuordnungen.findFirst({
      where: and(
        eq(terminZuordnungen.terminId, zuordnung.terminId),
        eq(terminZuordnungen.userId, rolle.userId),
        eq(terminZuordnungen.funktionstraegerTyp, zuordnung.funktionstraegerTyp)
      ),
    });

    let zuordnungsMail: { termin: typeof termine.$inferSelect; rolle: ZeitnehmerRolle } | null =
      null;
    if (vorhanden) {
      await tx
        .delete(terminZuordnungen)
        .where(eq(terminZuordnungen.id, zuordnungId));
    } else {
      await tx
        .update(terminZuordnungen)
        .set({ userId: rolle.userId, externerName: null, matchVorschlagUserId: null })
        .where(eq(terminZuordnungen.id, zuordnungId));

      const termin = await tx.query.termine.findFirst({
        where: eq(termine.id, zuordnung.terminId),
      });
      if (termin) {
        zuordnungsMail = {
          termin,
          rolle: zuordnung.funktionstraegerTyp as ZeitnehmerRolle,
        };
      }
    }

    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });

    return {
      email: rolle.email,
      vereinName: verein?.name ?? "HandballerPate",
      aktiviert: warInaktiv,
      einmalPasswort,
      zuordnungsMail,
    };
  });

  if (ergebnis.aktiviert) {
    try {
      const inhalt = willkommensInhalt(
        ergebnis.vereinName,
        ergebnis.email,
        ergebnis.einmalPasswort
      );
      await sendMail(
        ergebnis.email,
        "Zugang für HandballerPate",
        emailAlsText(inhalt),
        emailAlsHtml(inhalt)
      );
    } catch (err) {
      console.error("Willkommens-Mail konnte nicht gesendet werden:", err);
    }
  }
  if (ergebnis.zuordnungsMail) {
    const mailParams = {
      vereinName: ergebnis.vereinName,
      ...zuordnungsMailInhalt(
        ergebnis.zuordnungsMail.rolle,
        ergebnis.zuordnungsMail.termin
      ),
    };
    try {
      await sendMail(
        ergebnis.email,
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
  revalidatePath("/admin/funktionstraeger");
}
