"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, vereine } from "@/db/schema";
import {
  mehrfachZuordnungsMailInhalt,
  pruefeBesetzungsgrenze,
  pruefeKeineDoppelrolle,
  zuordnungsMailInhalt,
} from "@/lib/zuordnung";
import { holeZeitnehmerEinsatzZahlen } from "@/lib/zeitnehmerwart";
import { findeNamensVorschlag } from "@/lib/namens-abgleich";
import { sendMail } from "@/lib/mailer";
import { terminMailHtml, terminMailText } from "@/lib/termin-mail";
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

export type MehrfachEintragErgebnis = {
  eingetragen: number;
  gesamt: number;
  // Mehrere Fehler mit " | " getrennt, analog zu den Import-/nuLiga-
  // Ergebnissen in admin/funktionstraeger und admin/einstellungen.
  fehler: string | null;
};

// Mehrfach-Variante von zeitnehmerSelbstEintragenOeffentlich oben: derselbe
// Name/dieselbe Rolle wird auf einmal für mehrere ausgewählte Termine
// eingetragen (siehe ZeitnehmerMehrfachAuswahl in mehrfachauswahl.tsx) —
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
export async function zeitnehmerSelbstEintragenMehrfachOeffentlich(
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

  const kandidaten = (await holeZeitnehmerEinsatzZahlen(verein.id)).filter((k) =>
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
          await pruefeBesetzungsgrenze(tx, verein.id, terminId, rolle);
          await pruefeKeineDoppelrolle(
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

  // Anders als bei der eingeloggten Selbstanmeldung hat hier möglicherweise
  // eine ANDERE Person den Namen eingetragen — wie bei jeder Fremdzuordnung
  // also eine Benachrichtigung, hier gebündelt in EINER Mail für alle neu
  // zugeordneten Termine statt einer Mail je Termin.
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

  revalidatePath(`/zeitnehmer-eintragen/${token}`);
  revalidatePath("/profil/zeitnehmerwart");
  revalidatePath("/admin/kalender");

  return {
    eingetragen: eingetrageneTermine.length,
    gesamt: terminIds.length,
    fehler: fehler.length > 0 ? fehler.join(" | ") : null,
  };
}
