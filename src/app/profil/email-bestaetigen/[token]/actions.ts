"use server";

import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { emailGeaendertInhalt, pruefeEmailVerfuegbar } from "@/lib/email-aendern";
import { sendMail } from "@/lib/mailer";

// Login-frei per Token (Kenntnis des Tokens ist die Berechtigung, siehe
// gleiches Prinzip bei /kalender/[token]) statt über die Session, da der
// Bestätigungslink typischerweise in einem separaten Mail-Client/Tab
// geöffnet wird, ohne dass dort zwingend eine aktive App-Session besteht.
// adminDb nur für den Token-Lookup, danach withTenant (siehe Kommentar in
// ordner-eintragen/[token]/actions.ts für dasselbe Grundprinzip).
export async function emailAenderungBestaetigen(
  formData: FormData
): Promise<{ neueEmail: string } | { fehler: string }> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    return { fehler: "Ungültiger Bestätigungslink." };
  }

  const user = await adminDb.query.users.findFirst({
    where: eq(users.pendingEmailToken, token),
  });
  if (!user || !user.vereinId) {
    return {
      fehler:
        "Dieser Bestätigungslink ist ungültig oder wurde bereits verwendet.",
    };
  }
  if (
    !user.pendingEmailTokenAblaufAm ||
    user.pendingEmailTokenAblaufAm.getTime() < Date.now()
  ) {
    return {
      fehler:
        "Dieser Bestätigungslink ist abgelaufen. Bitte fordere die Änderung über dein Profil erneut an.",
    };
  }
  const neueEmail = user.pendingEmail;
  if (!neueEmail) {
    return { fehler: "Es liegt keine ausstehende E-Mail-Änderung vor." };
  }

  const vereinId = user.vereinId;
  const alteEmail = user.email;

  try {
    await withTenant(vereinId, async (tx) => {
      // Erneute Prüfung: zwischen Anfrage und Bestätigung könnte die
      // Adresse anderweitig vergeben worden sein.
      await pruefeEmailVerfuegbar(tx, neueEmail, user.id);
      await tx
        .update(users)
        .set({
          email: neueEmail,
          pendingEmail: null,
          pendingEmailToken: null,
          pendingEmailTokenAblaufAm: null,
        })
        .where(eq(users.id, user.id));
    });
  } catch (err) {
    return {
      fehler:
        err instanceof Error
          ? err.message
          : "E-Mail-Adresse konnte nicht geändert werden.",
    };
  }

  const vereinRow = await adminDb.query.vereine.findFirst({
    where: eq(vereine.id, vereinId),
  });
  const vereinName = vereinRow?.name ?? "deinem Verein";

  try {
    const inhalt = emailGeaendertInhalt(vereinName, neueEmail, true);
    await sendMail(neueEmail, "E-Mail-Adresse geändert", emailAlsText(inhalt), emailAlsHtml(inhalt));
  } catch (err) {
    console.error("Info-Mail an neue Adresse fehlgeschlagen:", err);
  }
  try {
    const inhalt = emailGeaendertInhalt(vereinName, neueEmail, false);
    await sendMail(alteEmail, "E-Mail-Adresse geändert", emailAlsText(inhalt), emailAlsHtml(inhalt));
  } catch (err) {
    console.error("Info-Mail an alte Adresse fehlgeschlagen:", err);
  }

  return { neueEmail };
}
