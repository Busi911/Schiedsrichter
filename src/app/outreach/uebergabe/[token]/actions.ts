"use server";

import { eq, sql } from "drizzle-orm";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { adminDb } from "@/db/admin";
import { vereine, users, treuhandZugriffe, vereinProtokoll } from "@/db/schema";
import { pruefeOutreachUebergabeToken } from "@/lib/outreach-uebergabe";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";
import { signIn } from "@/auth";

// Selbstbedienungs-Übergabe: Der Outreach-Empfänger übernimmt den Verein
// direkt aus der Mail heraus. Legt den User an, setzt den Verein auf "aktiv",
// löscht Treuhand-Zugriffe, und sendet einen Magic-Link zum Einloggen.
// Danach wird eine Benachrichtigung an den Betreiber (SMTP_USER) gesendet.
//
// Sicherheit: Der Token ist HMAC-signiert und an diesen einen Verein gebunden.
// Die E-Mail-Verifikation erfolgt über den Magic-Link (Auth.js Nodemailer).
export async function uebergebeVereinSelbstbedienung(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!name || !email) {
    throw new Error("Bitte Name und E-Mail-Adresse angeben.");
  }

  const vereinId = pruefeOutreachUebergabeToken(token);
  if (!vereinId) {
    throw new Error("Der Link ist ungültig oder abgelaufen.");
  }

  // Verein muss noch in Vorbereitung sein (nicht schon übergeben).
  const [verein] = await adminDb
    .select({ id: vereine.id, name: vereine.name, status: vereine.status })
    .from(vereine)
    .where(eq(vereine.id, vereinId));
  if (!verein) {
    throw new Error("Verein nicht gefunden.");
  }
  if (verein.status !== "vorbereitung") {
    throw new Error("Dieser Verein wurde bereits übergeben.");
  }

  // E-Mail darf noch nicht vergeben sein.
  const [vergeben] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (vergeben) {
    throw new Error(
      "Diese E-Mail-Adresse ist bereits vergeben. Bitte melde dich stattdessen an."
    );
  }

  // Übergabe in einer Transaktion: User anlegen, Verein aktiv schalten,
  // Treuhand-Zugriffe löschen, Protokoll.
  await adminDb.transaction(async (tx) => {
    await tx.insert(users).values({
      email,
      name,
      vereinId,
      istAdmin: true,
    });
    await tx
      .update(vereine)
      .set({ status: "aktiv", uebergebenAm: new Date() })
      .where(eq(vereine.id, vereinId));
    await tx.delete(treuhandZugriffe).where(
      eq(treuhandZugriffe.vereinId, vereinId)
    );
    await tx.insert(vereinProtokoll).values({
      vereinId,
      aktion: "uebergeben",
      akteur: "Outreach-Selbstbedienung",
      details: `${name} <${email}>`,
    });
  });

  // Magic-Link versenden — Auth.js Nodemailer-Provider schickt die
  // Verifikations-Mail an die angegebene Adresse.
  try {
    await signIn("nodemailer", {
      email,
      redirectTo: "/admin",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      throw new Error("Login-Link konnte nicht gesendet werden. Bitte versuche es später erneut.");
    }
    // Redirect-Fehler: Mail wurde gesendet, weiterleitung zur Bestätigung.
  }

  // Benachrichtigung an den Betreiber (SMTP_USER = Absenderadresse).
  const benachrichtigung: EmailInhalt = {
    ueberschrift: `Verein übernommen: ${verein.name}`,
    zeilen: [
      `${name} hat den Verein ${verein.name} über die Outreach-Selbstbedienung übernommen.`,
      `E-Mail-Adresse: ${email}`,
      `Login-Link wurde versendet. Der Verein ist jetzt aktiv.`,
    ],
    cta: { text: "Verein im Systemadmin", url: `${appUrl()}/system/vereine` },
  };
  try {
    const betreiber = process.env.SMTP_USER;
    if (betreiber) {
      await sendMail(
        betreiber,
        `Verein übernommen: ${verein.name}`,
        emailAlsText(benachrichtigung),
        emailAlsHtml(benachrichtigung)
      );
    }
  } catch {
    // Benachrichtigung ist best-effort — die Übergabe selbst ist schon erfolgt.
  }

  redirect(
    `/outreach/uebergabe/gesendet?email=${encodeURIComponent(email)}`
  );
}
