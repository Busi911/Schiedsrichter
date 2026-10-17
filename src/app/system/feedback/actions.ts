"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { produktFeedback, users } from "@/db/schema";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { FEEDBACK_ANTWORT_BETREFF, feedbackAntwortInhalt } from "@/lib/feedback-antwort-mail";
import { sendMail } from "@/lib/mailer";
import { requireSystemAdmin } from "@/lib/session";

// Feedback ist vereinsübergreifend: Schreiben direkt über adminDb (nur der Systemadmin, wie das Lesen auf der Seite).
export async function feedbackErledigtSetzen(formData: FormData) {
  await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  const erledigt = formData.get("erledigt") === "1";
  if (!id) return;
  await adminDb
    .update(produktFeedback)
    .set({ erledigtAm: erledigt ? new Date() : null })
    .where(eq(produktFeedback.id, id));
  revalidatePath("/system/feedback");
}

// Antwort direkt aus der App: Mail an die Person, die das Feedback geschrieben hat (Adresse aus der Datenbank, nie aus dem
// Formular). Antworten auf die Mail gehen an den Systemadmin (replyTo). Danach optional als erledigt markiert.
export async function feedbackBeantworten(formData: FormData) {
  const session = await requireSystemAdmin();
  const id = String(formData.get("id") ?? "");
  const antwort = String(formData.get("antwort") ?? "").trim();
  const fehler = (text: string): never => redirect(`/system/feedback?fehler=${encodeURIComponent(text)}`);
  if (!id) fehler("Rückmeldung nicht gefunden.");
  if (!antwort) fehler("Bitte eine Antwort eingeben.");

  const [eintrag] = await adminDb
    .select({ nachricht: produktFeedback.nachricht, personName: users.name, personEmail: users.email })
    .from(produktFeedback)
    .innerJoin(users, eq(produktFeedback.userId, users.id))
    .where(eq(produktFeedback.id, id));
  if (!eintrag) fehler("Rückmeldung nicht gefunden.");
  if (!eintrag.personEmail) fehler("Die Person hat keine E-Mail-Adresse.");

  const inhalt = feedbackAntwortInhalt({ personName: eintrag.personName, antwort, nachricht: eintrag.nachricht });
  try {
    await sendMail(eintrag.personEmail, FEEDBACK_ANTWORT_BETREFF, emailAlsText(inhalt), emailAlsHtml(inhalt), {
      replyTo: session.user.email ?? undefined,
    });
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    fehler(`Versand fehlgeschlagen: ${meldung.slice(0, 200)}`);
  }

  if (formData.get("erledigt") === "on") {
    await adminDb.update(produktFeedback).set({ erledigtAm: new Date() }).where(eq(produktFeedback.id, id));
  }
  revalidatePath("/system/feedback");
  redirect(`/system/feedback?ok=${encodeURIComponent(`Antwort an ${eintrag.personEmail} gesendet.`)}`);
}
