"use server";

import { withTenant } from "@/db";
import { produktFeedback } from "@/db/schema";
import { requireSession } from "@/lib/session";

// Niedrigschwelliger Feedback-Kanal direkt aus dem Header (siehe
// FeedbackDialog) — Vereine testen die App gerade aktiv, ein Klick soll
// genügen statt Umweg über E-Mail/externes Formular. Landet in
// produkt_feedback, einsehbar vereinsübergreifend unter /system/feedback.
export async function feedbackSenden(formData: FormData) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const nachricht = formData.get("nachricht");
  const seite = formData.get("seite");
  if (typeof nachricht !== "string" || !nachricht.trim()) {
    throw new Error("Feedback darf nicht leer sein.");
  }

  await withTenant(vereinId, (tx) =>
    tx.insert(produktFeedback).values({
      vereinId,
      userId,
      seite: typeof seite === "string" && seite ? seite : "unbekannt",
      nachricht: nachricht.trim(),
    })
  );
}
