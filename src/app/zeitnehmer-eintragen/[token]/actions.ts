"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import {
  mehrfachZuordnungsMailInhalt,
  neueSelbstregistrierungInhalt,
  pruefeBesetzungsgrenze,
  pruefeKeineDoppelrolle,
  zuordnungFehlgeschlagenInhalt,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import { holeZeitnehmerEinsatzZahlen } from "@/lib/zeitnehmerwart";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { requireSession } from "@/lib/session";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";
import { formatDatumZeit } from "@/lib/format";

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;
type ZeitnehmerRolle = (typeof ZEITNEHMER_ROLLEN)[number];

// Öffentliche, login-freie Selbsteintragung — Kenntnis des Tokens ist die
// Berechtigung (wie bei /turnier/[token]). Bewusst adminDb für den
// Token-Lookup (keine Session/vereinId vorhanden), danach ausschließlich
// withTenant(verein.id, ...) für alles Weitere — echte Mandantentrennung
// über RLS statt Bypass.
export async function zeitnehmerSelbstEintragenOeffentlich(formData: FormData) {
  const token = formData.get("token");
  const terminId = formData.get("terminId");
  const name = formData.get("name");
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) {
    throw new Error("Ungültiger Link.");
  }
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
  const eingegebenerName = name.trim();

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.zeitnehmerSelbstanmeldungToken, token),
  });
  if (!verein) {
    throw new Error("Ungültiger oder nicht mehr aktiver Link.");
  }

  // Kandidaten für den Namensabgleich AUSSERHALB der Transaktion geladen,
  // da holeZeitnehmerEinsatzZahlen selbst schon withTenant nutzt (keine
  // verschachtelten Transaktionen).
  const kandidaten = (await holeZeitnehmerEinsatzZahlen(verein.id)).filter((k) =>
    k.rollen.includes(rolle)
  );
  const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);

  const benachrichtigung = await withTenant(verein.id, async (tx) => {
    const termin = await tx.query.termine.findFirst({
      where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    await pruefeBesetzungsgrenze(tx, verein.id, terminId, rolle);

    if (exakt) {
      await pruefeKeineDoppelrolle(tx, terminId, { userId: exakt.userId });

      await tx.insert(terminZuordnungen).values({
        terminId,
        userId: exakt.userId,
        funktionstraegerTyp: rolle,
        quelle: "selbst_eingetragen_oeffentlich",
      });

      // Anders als bei der eingeloggten Selbstanmeldung (selbstAnmelden in
      // profil/actions.ts) hat hier möglicherweise eine ANDERE Person den
      // Namen eingetragen — die zugeordnete Person weiß davon noch nichts,
      // daher wie bei jeder Fremdzuordnung eine Benachrichtigung.
      const kandidatMitMail = kandidaten.find((k) => k.userId === exakt.userId);
      if (!kandidatMitMail) return null;
      return {
        termin,
        email: kandidatMitMail.email,
        vereinName: verein.name,
        rolle,
      };
    }

    await pruefeKeineDoppelrolle(tx, terminId, { externerName: eingegebenerName });

    await tx.insert(terminZuordnungen).values({
      terminId,
      userId: null,
      externerName: eingegebenerName,
      matchVorschlagUserId: vorschlag?.userId ?? null,
      funktionstraegerTyp: rolle,
      quelle: "selbst_eingetragen_oeffentlich",
    });
    return null;
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

  revalidatePath(`/zeitnehmer-eintragen/${token}`);
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");
}

// Mehrfach-Variante von zeitnehmerSelbstEintragenOeffentlich oben: derselbe
// Name/dieselbe Rolle wird auf einmal für mehrere ausgewählte Termine
// eingetragen (siehe TerminMehrfachAuswahl in mehrfachauswahl.tsx) —
// praktisch, wenn sich jemand z.B. für ein ganzes Turnierwochenende
// einträgt, statt jeden Termin einzeln abzuschicken. Namensabgleich läuft
// EINMAL für alle Termine (identischer Name/Rolle), jeder Termin bekommt
// aber eine EIGENE Transaktion, damit ein bereits voll besetzter Termin
// nicht die anderen, noch erfolgreichen Eintragungen verhindert.
//
// Gibt Fehler als Rückgabewert zurück statt zu werfen (siehe React-Doku zu
// useActionState: "model expected errors as return values, not exceptions")
// — ein Wurf hier landete beim Aufruf über useActionState (mehrfachauswahl.
// tsx) NICHT im normalen Server-Action-Fehlerkanal, sondern wurde von
// Next.js als Fehler beim Rendern der (durch revalidatePath aktualisierten)
// Server Components behandelt und dabei auf "Minified React error #441"
// ohne Klartext reduziert.
type Identitaet =
  | { art: "userId"; userId: string; email: string }
  | { art: "extern"; externerName: string; matchVorschlagUserId: string | null };

async function holeZeitnehmerwarteEmails(vereinId: string) {
  return withTenant(vereinId, (tx) =>
    tx
      .select({ email: users.email })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          eq(funktionstraegerRollen.typ, "zeitnehmerwart"),
          eq(funktionstraegerRollen.aktiv, true)
        )
      )
  );
}

// Siehe loeseIdentitaetPerEmailAuf in ordner-eintragen/[token]/actions.ts —
// identisches Muster, nur für zeitnehmer/sekretaer statt ORDNER_ROLLEN.
async function loeseIdentitaetPerEmailAuf(
  vereinId: string,
  email: string,
  name: string,
  rolle: ZeitnehmerRolle
): Promise<{ identitaet: Identitaet; warNeuRegistriert: boolean }> {
  return withTenant(vereinId, async (tx) => {
    let user = await tx.query.users.findFirst({ where: eq(users.email, email) });
    if (user && user.vereinId !== vereinId) {
      throw new Error(
        "Diese E-Mail-Adresse ist bereits einem anderen Verein zugeordnet."
      );
    }
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email, name, vereinId })
        .returning();
    }

    const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, user.id),
        eq(funktionstraegerRollen.typ, rolle)
      ),
    });
    let warNeuRegistriert = false;
    if (!vorhandeneRolle) {
      await tx
        .insert(funktionstraegerRollen)
        .values({ userId: user.id, typ: rolle, aktiv: false });
      warNeuRegistriert = true;
    }

    return {
      identitaet: { art: "userId" as const, userId: user.id, email: user.email },
      warNeuRegistriert,
    };
  });
}

// Siehe ordnerSelbstEintragenMehrfachOeffentlich in
// ordner-eintragen/[token]/actions.ts für die ausführliche Begründung des
// Musters (eigene Transaktion je Termin, Fehler als Rückgabewert statt
// Wurf) und der optionalen E-Mail (löst die Identität eindeutig auf und
// legt bei Bedarf ein zunächst inaktives Konto an).
export async function zeitnehmerSelbstEintragenMehrfachOeffentlich(
  formData: FormData
): Promise<MehrfachEintragErgebnis> {
  const token = formData.get("token");
  const terminIds = formData
    .getAll("terminIds")
    .filter((v): v is string => typeof v === "string" && !!v);
  const name = formData.get("name");
  const emailRoh = formData.get("email");
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) {
    return { eingetragen: 0, gesamt: 0, fehler: "Ungültiger Link." };
  }
  if (terminIds.length === 0) {
    return {
      eingetragen: 0,
      gesamt: 0,
      fehler: "Bitte mindestens einen Termin auswählen.",
    };
  }
  if (typeof name !== "string" || !name.trim()) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Name ist erforderlich.",
    };
  }
  if (
    typeof rolleRoh !== "string" ||
    !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Bitte eine Rolle auswählen.",
    };
  }
  const rolle = rolleRoh as ZeitnehmerRolle;
  const eingegebenerName = name.trim();
  const eingegebeneEmail =
    typeof emailRoh === "string" ? emailRoh.trim().toLowerCase() : "";

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.zeitnehmerSelbstanmeldungToken, token),
  });
  if (!verein) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Ungültiger oder nicht mehr aktiver Link.",
    };
  }

  let identitaet: Identitaet;
  let warNeuRegistriert = false;
  if (eingegebeneEmail) {
    try {
      ({ identitaet, warNeuRegistriert } = await loeseIdentitaetPerEmailAuf(
        verein.id,
        eingegebeneEmail,
        eingegebenerName,
        rolle
      ));
    } catch (err) {
      return {
        eingetragen: 0,
        gesamt: terminIds.length,
        fehler: err instanceof Error ? err.message : "Registrierung fehlgeschlagen.",
      };
    }
  } else {
    const kandidaten = (await holeZeitnehmerEinsatzZahlen(verein.id)).filter((k) =>
      k.rollen.includes(rolle)
    );
    const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);
    identitaet = exakt
      ? {
          art: "userId",
          userId: exakt.userId,
          email: kandidaten.find((k) => k.userId === exakt.userId)?.email ?? "",
        }
      : {
          art: "extern",
          externerName: eingegebenerName,
          matchVorschlagUserId: vorschlag?.userId ?? null,
        };
  }

  const eingetrageneTermine: {
    start: Date;
    ort: string | null;
    beschreibung: string | null;
  }[] = [];
  const fehler: string[] = [];

  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(verein.id, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        try {
          await pruefeBesetzungsgrenze(tx, verein.id, terminId, rolle);
          await pruefeKeineDoppelrolle(
            tx,
            terminId,
            identitaet.art === "userId"
              ? { userId: identitaet.userId }
              : { externerName: identitaet.externerName }
          );
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${
              err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."
            }`
          );
        }

        await tx.insert(terminZuordnungen).values({
          terminId,
          userId: identitaet.art === "userId" ? identitaet.userId : null,
          externerName: identitaet.art === "extern" ? identitaet.externerName : null,
          matchVorschlagUserId:
            identitaet.art === "extern" ? identitaet.matchVorschlagUserId : null,
          funktionstraegerTyp: rolle,
          quelle: "selbst_eingetragen_oeffentlich",
        });
        return termin;
      });

      if (termin) eingetrageneTermine.push(termin);
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : "Unbekannter Fehler.");
    }
  }

  // Anders als bei der eingeloggten Selbstanmeldung hat hier möglicherweise
  // eine ANDERE Person den Namen eingetragen — wie bei jeder Fremdzuordnung
  // also eine Benachrichtigung, hier gebündelt in EINER Mail für alle neu
  // zugeordneten Termine statt einer Mail je Termin.
  if (identitaet.art === "userId" && identitaet.email && eingetrageneTermine.length > 0) {
    const mailParams = {
      vereinName: verein.name,
      ...mehrfachZuordnungsMailInhalt(rolle, eingetrageneTermine),
    };
    try {
      await sendMail(
        identitaet.email,
        "Neue Termin-Zuordnungen",
        terminMailText(mailParams),
        terminMailHtml(mailParams)
      );
    } catch (err) {
      console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
    }
  }

  if (warNeuRegistriert) {
    const zeitnehmerwarte = await holeZeitnehmerwarteEmails(verein.id);
    if (zeitnehmerwarte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...neueSelbstregistrierungInhalt(eingegebenerName, eingegebeneEmail, rolle, {
          text: "Zur Funktionsträger-Verwaltung",
          url: `${appUrl()}/admin/funktionstraeger`,
        }),
      };
      for (const wart of zeitnehmerwarte) {
        try {
          await sendMail(
            wart.email,
            "Neue Selbstregistrierung wartet auf Freischaltung",
            emailAlsText(inhalt),
            emailAlsHtml(inhalt)
          );
        } catch (err) {
          console.error(
            "Registrierungs-Mail an Zeitnehmerwart konnte nicht gesendet werden:",
            err
          );
        }
      }
    }
  }

  // Fehlgeschlagene Termine bekommt die eintragende Person zwar direkt als
  // Fehlermeldung angezeigt (siehe fehler im Rückgabewert unten), meldet
  // sich deswegen aber nicht zwangsläufig beim Zeitnehmerwart — der bekommt
  // es sonst gar nicht mit (z.B. wenn der konfigurierte Bedarf zu niedrig
  // ist oder jemand versehentlich doppelt versucht).
  if (fehler.length > 0) {
    const zeitnehmerwarte = await holeZeitnehmerwarteEmails(verein.id);
    if (zeitnehmerwarte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...zuordnungFehlgeschlagenInhalt(eingegebenerName, rolle, fehler, {
          text: "Zur Zeitnehmer-Übersicht",
          url: `${appUrl()}/profil/zeitnehmerwart`,
        }),
      };
      for (const wart of zeitnehmerwarte) {
        try {
          await sendMail(
            wart.email,
            "Selbsteintragung fehlgeschlagen",
            emailAlsText(inhalt),
            emailAlsHtml(inhalt)
          );
        } catch (err) {
          console.error(
            "Fehlschlags-Mail an Zeitnehmerwart konnte nicht gesendet werden:",
            err
          );
        }
      }
    }
  }

  revalidatePath(`/zeitnehmer-eintragen/${token}`);
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/funktionstraeger");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
  };
}

// Variante für eine erkannte, eingeloggte Session — siehe
// ordnerSelbstEintragenMehrfachEingeloggt in
// ordner-eintragen/[token]/actions.ts für die ausführliche Begründung
// (keine Bestätigungs-Mail an die Person selbst, fehlende Rolle wird
// SOFORT aktiv angelegt statt wie bei der E-Mail-Registrierung oben erst
// nach Freischaltung durch den Wart — eine eingeloggte Person ist bereits
// ein verifiziertes Vereinsmitglied).
export async function zeitnehmerSelbstEintragenMehrfachEingeloggt(
  formData: FormData
): Promise<MehrfachEintragErgebnis> {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const token = formData.get("token");
  const terminIds = formData
    .getAll("terminIds")
    .filter((v): v is string => typeof v === "string" && !!v);
  const rolleRoh = formData.get("rolle");

  if (typeof token !== "string" || !token) {
    return { eingetragen: 0, gesamt: 0, fehler: "Ungültiger Link." };
  }
  if (terminIds.length === 0) {
    return {
      eingetragen: 0,
      gesamt: 0,
      fehler: "Bitte mindestens einen Termin auswählen.",
    };
  }
  if (
    typeof rolleRoh !== "string" ||
    !(ZEITNEHMER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Bitte eine Rolle auswählen.",
    };
  }
  const rolle = rolleRoh as ZeitnehmerRolle;

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.zeitnehmerSelbstanmeldungToken, token),
  });
  if (!verein || verein.id !== vereinId) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Ungültiger Link oder falscher Verein.",
    };
  }

  await withTenant(vereinId, async (tx) => {
    const vorhandeneRolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, rolle)
      ),
    });
    if (!vorhandeneRolle) {
      await tx
        .insert(funktionstraegerRollen)
        .values({ userId, typ: rolle, aktiv: true });
    } else if (!vorhandeneRolle.aktiv) {
      await tx
        .update(funktionstraegerRollen)
        .set({ aktiv: true })
        .where(eq(funktionstraegerRollen.id, vorhandeneRolle.id));
    }
  });

  const eingetrageneTermine: {
    start: Date;
    ort: string | null;
    beschreibung: string | null;
  }[] = [];
  const fehler: string[] = [];

  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(vereinId, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        try {
          await pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle);
          await pruefeKeineDoppelrolle(tx, terminId, { userId });
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${
              err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."
            }`
          );
        }

        await tx.insert(terminZuordnungen).values({
          terminId,
          userId,
          funktionstraegerTyp: rolle,
          quelle: "selbst_angemeldet",
        });
        return termin;
      });

      if (termin) eingetrageneTermine.push(termin);
    } catch (err) {
      fehler.push(err instanceof Error ? err.message : "Unbekannter Fehler.");
    }
  }

  revalidatePath(`/zeitnehmer-eintragen/${token}`);
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/profil");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
  };
}
