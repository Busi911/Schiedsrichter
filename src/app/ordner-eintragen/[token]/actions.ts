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
  zuordnungFehlgeschlagenInhalt,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import {
  holeOrdnerEinsatzZahlen,
  holeOrdnerwarteEmails,
  ORDNER_ROLLEN,
  pruefeKeineOrdnerDoppelrolle,
  pruefeOrdnerBesetzungsgrenze,
} from "@/lib/ordnerwart";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { requireSession } from "@/lib/session";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";
import { formatDatumZeit } from "@/lib/format";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

type OrdnerRolle = (typeof ORDNER_ROLLEN)[number];

// Öffentliche, login-freie Selbsteintragung für Ordner/Kioskdienst/Kassierer
// — analog
// zu zeitnehmerSelbstEintragenOeffentlich in
// zeitnehmer-eintragen/[token]/actions.ts, siehe dortige Kommentare für die
// Grundprinzipien (Token statt Session, adminDb nur für den Token-Lookup,
// danach ausschließlich withTenant).
export async function ordnerSelbstEintragenOeffentlich(formData: FormData) {
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
    !(ORDNER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    throw new Error("Bitte eine Rolle auswählen.");
  }
  const rolle = rolleRoh as OrdnerRolle;
  const eingegebenerName = name.trim();

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.ordnerSelbstanmeldungToken, token),
  });
  if (!verein) {
    throw new Error("Ungültiger oder nicht mehr aktiver Link.");
  }

  const kandidaten = (await holeOrdnerEinsatzZahlen(verein.id)).filter((k) =>
    k.rollen.includes(rolle)
  );
  const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);

  const benachrichtigung = await withTenant(verein.id, async (tx) => {
    const termin = await tx.query.termine.findFirst({
      where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
    });
    if (!termin) throw new Error("Termin nicht gefunden.");

    await pruefeOrdnerBesetzungsgrenze(tx, verein.id, terminId, termin, rolle);

    if (exakt) {
      await pruefeKeineOrdnerDoppelrolle(tx, terminId, { userId: exakt.userId }, rolle);

      await tx.insert(terminZuordnungen).values({
        terminId,
        userId: exakt.userId,
        funktionstraegerTyp: rolle,
        quelle: "selbst_eingetragen_oeffentlich",
      });

      const kandidatMitMail = kandidaten.find((k) => k.userId === exakt.userId);
      if (!kandidatMitMail) return null;
      return {
        termin,
        email: kandidatMitMail.email,
        vereinName: verein.name,
        rolle,
      };
    }

    await pruefeKeineOrdnerDoppelrolle(
      tx,
      terminId,
      { externerName: eingegebenerName },
      rolle
    );

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

  revalidatePath(`/ordner-eintragen/${token}`);
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/admin/kalender");
}

// Wer die eingegebene Person letztlich IST, für den Rest der Funktion
// unten einheitlich behandelt — "userId" entweder aus einem Namensabgleich-
// Treffer (siehe findeNamensVorschlag) oder, wenn eine E-Mail angegeben
// wurde, aus einem definitiv aufgelösten Konto (siehe loeseIdentitaetAuf
// unten); "extern" ist der bisherige Fallback ohne Konto/E-Mail.
type Identitaet =
  | { art: "userId"; userId: string; email: string }
  | { art: "extern"; externerName: string; matchVorschlagUserId: string | null };

// Löst die E-Mail-Variante der Identität auf: bestehendes Konto (im
// eigenen Verein) wiederverwenden oder neu anlegen, dann die Rolle
// anlegen — bewusst INAKTIV (siehe funktionstraegerRollen.aktiv in
// db/schema.ts), damit sich nicht jeder mit einer beliebigen E-Mail-Adresse
// ungeprüft selbst zum aktiven Funktionsträger macht. Ein Wart muss die
// Person erst freischalten (siehe /admin/funktionstraeger), genau wie beim
// manuellen Anlegen ohne "sofort aktivieren" (createFunktionstraeger in
// admin/actions.ts). warNeuRegistriert = true nur, wenn die Rolle dabei neu
// angelegt wurde (nicht bei einer bereits bekannten, ggf. schon aktiven
// Person) — steuert unten die Benachrichtigung an den Ordnerwart.
async function loeseIdentitaetPerEmailAuf(
  vereinId: string,
  email: string,
  name: string,
  rolle: OrdnerRolle
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

// Mehrfach-Variante von ordnerSelbstEintragenOeffentlich oben — siehe
// zeitnehmerSelbstEintragenMehrfachOeffentlich für die ausführliche
// Begründung des Musters (eigene Transaktion je Termin, Fehler als
// Rückgabewert statt Wurf). Die E-Mail ist optional (siehe zeigeEmailFeld in
// TerminMehrfachAuswahl): ohne sie bleibt es beim bisherigen reinen
// Namensabgleich, mit ihr wird die Identität eindeutig aufgelöst und bei
// Bedarf ein (zunächst inaktives) Konto angelegt — siehe
// loeseIdentitaetPerEmailAuf oben.
export async function ordnerSelbstEintragenMehrfachOeffentlich(
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
    !(ORDNER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Bitte eine Rolle auswählen.",
    };
  }
  const rolle = rolleRoh as OrdnerRolle;
  const eingegebenerName = name.trim();
  const eingegebeneEmail =
    typeof emailRoh === "string" ? emailRoh.trim().toLowerCase() : "";

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.ordnerSelbstanmeldungToken, token),
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
    const kandidaten = (await holeOrdnerEinsatzZahlen(verein.id)).filter((k) =>
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
  const warnungen: string[] = [];

  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(verein.id, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, verein.id)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        let warnung: string | null = null;
        try {
          await pruefeOrdnerBesetzungsgrenze(tx, verein.id, terminId, termin, rolle);
          ({ warnung } = await pruefeKeineOrdnerDoppelrolle(
            tx,
            terminId,
            identitaet.art === "userId"
              ? { userId: identitaet.userId }
              : { externerName: identitaet.externerName },
            rolle
          ));
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${
              err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."
            }`
          );
        }
        if (warnung) warnungen.push(`${formatDatumZeit(termin.start)}: ${warnung}`);

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
    const ordnerwarte = await holeOrdnerwarteEmails(verein.id);
    if (ordnerwarte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...neueSelbstregistrierungInhalt(eingegebenerName, eingegebeneEmail, rolle, {
          text: "Zur Funktionsträger-Verwaltung",
          // ?suche vorbelegt die Suche in FunktionstraegerTabelle direkt mit
          // der E-Mail — sonst landet der Wart auf der unfilterten Liste
          // aller Funktionsträger und muss die neu registrierte Person darin
          // erst manuell suchen.
          url: `${appUrl()}/admin/funktionstraeger?suche=${encodeURIComponent(eingegebeneEmail)}`,
        }),
      };
      for (const wart of ordnerwarte) {
        try {
          await sendMail(
            wart.email,
            "Neue Selbstregistrierung wartet auf Freischaltung",
            emailAlsText(inhalt),
            emailAlsHtml(inhalt)
          );
        } catch (err) {
          console.error(
            "Registrierungs-Mail an Ordnerwart konnte nicht gesendet werden:",
            err
          );
        }
      }
    }
  }

  if (fehler.length > 0) {
    const ordnerwarte = await holeOrdnerwarteEmails(verein.id);
    if (ordnerwarte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...zuordnungFehlgeschlagenInhalt(eingegebenerName, rolle, fehler, {
          text: "Zur Ordner-/Kioskdienst-/Kassierer-Übersicht",
          url: `${appUrl()}/profil/ordnerwart`,
        }),
      };
      for (const wart of ordnerwarte) {
        try {
          await sendMail(
            wart.email,
            "Selbsteintragung fehlgeschlagen",
            emailAlsText(inhalt),
            emailAlsHtml(inhalt)
          );
        } catch (err) {
          console.error(
            "Fehlschlags-Mail an Ordnerwart konnte nicht gesendet werden:",
            err
          );
        }
      }
    }
  }

  revalidatePath(`/ordner-eintragen/${token}`);
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/admin/funktionstraeger");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
    warnung: warnungen.length > 0 ? warnungen.join(" | ") : null,
  };
}

// Variante für eine erkannte, eingeloggte Session (siehe eingeloggtAls in
// TerminMehrfachAuswahl und die Session-Prüfung in page.tsx) — keine
// Namens-/E-Mail-Eingabe nötig, die Identität kommt direkt aus der Session.
// Anders als bei der E-Mail-Registrierung oben (unbekannte, ungeprüfte
// Person) ist eine eingeloggte Person bereits ein verifiziertes
// Vereinsmitglied — eine noch fehlende Rolle wird deshalb SOFORT aktiv
// angelegt, ohne Freischaltung durch den Ordnerwart (analog zu
// selbstAnmelden in profil/actions.ts, das allerdings eine bereits aktive
// Rolle voraussetzt statt sie bei Bedarf anzulegen). Bewusst OHNE
// Bestätigungs-Mail an die Person selbst — sie hat die Zuordnung gerade
// eingeloggt selbst ausgelöst, anders als bei den beiden Varianten oben, wo
// theoretisch auch jemand anderes den Namen eingetragen haben könnte.
export async function ordnerSelbstEintragenMehrfachEingeloggt(
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
    !(ORDNER_ROLLEN as readonly string[]).includes(rolleRoh)
  ) {
    return {
      eingetragen: 0,
      gesamt: terminIds.length,
      fehler: "Bitte eine Rolle auswählen.",
    };
  }
  const rolle = rolleRoh as OrdnerRolle;

  const verein = await adminDb.query.vereine.findFirst({
    where: eq(vereine.ordnerSelbstanmeldungToken, token),
  });
  // Zusätzlich zum Token-Abgleich wird geprüft, dass die eingeloggte Person
  // auch tatsächlich zu DIESEM Verein gehört — ein Token allein reicht bei
  // einer bestehenden Session nicht, sonst könnte eine fremde Session einen
  // fremden Link missbrauchen, um sich selbst (mit der eigenen Identität)
  // im falschen Verein einzutragen.
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
  const warnungen: string[] = [];

  for (const terminId of terminIds) {
    try {
      const termin = await withTenant(vereinId, async (tx) => {
        const termin = await tx.query.termine.findFirst({
          where: and(eq(termine.id, terminId), eq(termine.vereinId, vereinId)),
        });
        if (!termin) throw new Error("Termin nicht gefunden.");

        let warnung: string | null = null;
        try {
          await pruefeOrdnerBesetzungsgrenze(tx, vereinId, terminId, termin, rolle);
          ({ warnung } = await pruefeKeineOrdnerDoppelrolle(tx, terminId, { userId }, rolle));
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${
              err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."
            }`
          );
        }
        if (warnung) warnungen.push(`${formatDatumZeit(termin.start)}: ${warnung}`);

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

  revalidatePath(`/ordner-eintragen/${token}`);
  revalidatePath("/profil/ordnerwart");
  revalidatePath("/profil");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
    warnung: warnungen.length > 0 ? warnungen.join(" | ") : null,
  };
}
