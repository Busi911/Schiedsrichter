"use server";

import { withTenant } from "@/db";
import { produktFeedback } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { verbieteImDemo } from "@/lib/demo-verein";
import { benachrichtigeSystemAdminsUeberFeedback } from "@/lib/system-admin-benachrichtigung";

// Niedrigschwelliger Feedback-Kanal direkt aus dem Header (siehe
// FeedbackDialog) — Vereine testen die App gerade aktiv, ein Klick soll
// genügen statt Umweg über E-Mail/externes Formular. Landet in
// produkt_feedback, einsehbar vereinsübergreifend unter /system/feedback.
export async function feedbackSenden(formData: FormData) {
  const session = await requireSession();
  await verbieteImDemo(session.user.vereinId);
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const nachricht = formData.get("nachricht");
  const seite = formData.get("seite");
  if (typeof nachricht !== "string" || !nachricht.trim()) {
    throw new Error("Feedback darf nicht leer sein.");
  }

  const seiteText = typeof seite === "string" && seite ? seite : "unbekannt";
  await withTenant(vereinId, (tx) =>
    tx.insert(produktFeedback).values({
      vereinId,
      userId,
      seite: seiteText,
      nachricht: nachricht.trim(),
    })
  );

  // Bisher landete Feedback nur in der Tabelle und fiel erst beim nächsten Blick auf /system/feedback auf. Best effort:
  // ein Mail-Fehler darf das Absenden nicht scheitern lassen (das Feedback ist schon gespeichert).
  try {
    await benachrichtigeSystemAdminsUeberFeedback(
      vereinId,
      { name: session.user.name ?? null, email: session.user.email ?? null },
      seiteText,
      nachricht.trim()
    );
  } catch (err) {
    console.error("Feedback-Benachrichtigung fehlgeschlagen:", err);
  }
}
