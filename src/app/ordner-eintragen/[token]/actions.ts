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
  zuordnungFehlgeschlagenInhalt,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import {
  holeOrdnerEinsatzZahlen,
  ORDNER_ROLLEN,
  pruefeKeineOrdnerDoppelrolle,
  pruefeOrdnerBesetzungsgrenze,
} from "@/lib/ordnerwart";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";
import { formatDatumZeit } from "@/lib/format";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

type OrdnerRolle = (typeof ORDNER_ROLLEN)[number];

// Öffentliche, login-freie Selbsteintragung für Ordner/Kioskdienst — analog
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
      await pruefeKeineOrdnerDoppelrolle(tx, terminId, { userId: exakt.userId });

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

    await pruefeKeineOrdnerDoppelrolle(tx, terminId, { externerName: eingegebenerName });

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

// Mehrfach-Variante von ordnerSelbstEintragenOeffentlich oben — siehe
// zeitnehmerSelbstEintragenMehrfachOeffentlich für die ausführliche
// Begründung des Musters (eigene Transaktion je Termin, Fehler als
// Rückgabewert statt Wurf).
export async function ordnerSelbstEintragenMehrfachOeffentlich(
  formData: FormData
): Promise<MehrfachEintragErgebnis> {
  const token = formData.get("token");
  const terminIds = formData
    .getAll("terminIds")
    .filter((v): v is string => typeof v === "string" && !!v);
  const name = formData.get("name");
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

  const kandidaten = (await holeOrdnerEinsatzZahlen(verein.id)).filter((k) =>
    k.rollen.includes(rolle)
  );
  const { exakt, vorschlag } = findeNamensVorschlag(eingegebenerName, kandidaten);

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
          await pruefeOrdnerBesetzungsgrenze(tx, verein.id, terminId, termin, rolle);
          await pruefeKeineOrdnerDoppelrolle(
            tx,
            terminId,
            exakt ? { userId: exakt.userId } : { externerName: eingegebenerName }
          );
        } catch (err) {
          throw new Error(
            `${formatDatumZeit(termin.start)}: ${
              err instanceof Error ? err.message : "Bereits voll besetzt oder doppelt eingetragen."
            }`
          );
        }

        if (exakt) {
          await tx.insert(terminZuordnungen).values({
            terminId,
            userId: exakt.userId,
            funktionstraegerTyp: rolle,
            quelle: "selbst_eingetragen_oeffentlich",
          });
          return termin;
        }

        await tx.insert(terminZuordnungen).values({
          terminId,
          userId: null,
          externerName: eingegebenerName,
          matchVorschlagUserId: vorschlag?.userId ?? null,
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

  if (exakt && eingetrageneTermine.length > 0) {
    const kandidatMitMail = kandidaten.find((k) => k.userId === exakt.userId);
    if (kandidatMitMail) {
      const mailParams = {
        vereinName: verein.name,
        ...mehrfachZuordnungsMailInhalt(rolle, eingetrageneTermine),
      };
      try {
        await sendMail(
          kandidatMitMail.email,
          "Neue Termin-Zuordnungen",
          terminMailText(mailParams),
          terminMailHtml(mailParams)
        );
      } catch (err) {
        console.error("Zuordnungs-Mail konnte nicht gesendet werden:", err);
      }
    }
  }

  if (fehler.length > 0) {
    const ordnerwarte = await withTenant(verein.id, (tx) =>
      tx
        .select({ email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(
          and(
            eq(funktionstraegerRollen.typ, "ordnerwart"),
            eq(funktionstraegerRollen.aktiv, true)
          )
        )
    );
    if (ordnerwarte.length > 0) {
      const inhalt = {
        vereinName: verein.name,
        ...zuordnungFehlgeschlagenInhalt(eingegebenerName, rolle, fehler, {
          text: "Zur Ordner-/Kioskdienst-Übersicht",
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
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
  };
}
