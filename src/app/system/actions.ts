"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "@/lib/email-layout";
import { eq } from "drizzle-orm";
import { requireSystemAdmin } from "@/lib/session";
import { adminDb } from "@/db/admin";
import { systemEinstellungen } from "@/db/schema";
import { holeSystemEinstellungen } from "@/lib/system-einstellungen";

// Direkt über adminDb statt withTenant: system_einstellungen ist bewusst
// OHNE verein_id/RLS (siehe Tabellen-Kommentar in db/schema.ts) — ein
// echter Singleton ohne Mandantenbezug, withTenant würde hier nichts
// isolieren, das isoliert werden müsste.
export async function betaVereinLimitSpeichern(formData: FormData) {
  await requireSystemAdmin();

  const limitRoh = formData.get("betaVereinLimit");
  const limit = Number(limitRoh);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("Ungültiges Limit — bitte eine ganze Zahl ≥ 0 angeben.");
  }

  const bestehend = await holeSystemEinstellungen();
  if (bestehend.id) {
    await adminDb
      .update(systemEinstellungen)
      .set({ betaVereinLimit: limit })
      .where(eq(systemEinstellungen.id, bestehend.id));
  } else {
    await adminDb.insert(systemEinstellungen).values({ betaVereinLimit: limit });
  }

  revalidatePath("/system");
}

// Testmail an eine frei wählbare Adresse, damit der Systemadmin im Posteingang/Spam und im Header
// (SPF/DKIM/DMARC) prüfen kann, wie die Mails von HandballerPate ankommen.
export async function testMailSenden(formData: FormData) {
  const session = await requireSystemAdmin();
  const roh = formData.get("empfaenger");
  const empfaenger = typeof roh === "string" ? roh.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empfaenger)) {
    redirect(`/system/mail?fehler=${encodeURIComponent("Bitte eine gültige E-Mail-Adresse eingeben.")}`);
  }
  const jetzt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "medium" }).format(new Date());
  const inhalt: EmailInhalt = {
    ueberschrift: "Testmail von HandballerPate",
    zeilen: [
      "Diese Mail wurde vom Systemadmin-Bereich ausgelöst, um die Zustellung zu prüfen.",
      `Gesendet am ${jetzt} (angefordert von ${session.user.email ?? "Systemadmin"}).`,
      "Landet sie im Spam, bitte „Kein Spam“ wählen und im Header (Original anzeigen) SPF, DKIM und DMARC ansehen.",
    ],
    kleingedrucktes: "Reine Testmail, keine Antwort nötig.",
  };
  try {
    await sendMail(empfaenger, "HandballerPate: Testmail", emailAlsText(inhalt), emailAlsHtml(inhalt));
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    redirect(`/system/mail?fehler=${encodeURIComponent(`Versand fehlgeschlagen: ${meldung.slice(0, 200)}`)}`);
  }
  redirect(`/system/mail?gesendet=${encodeURIComponent(empfaenger)}`);
}
