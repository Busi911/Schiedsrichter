"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import { requireSystemAdmin } from "@/lib/session";
import { legeVereinMitAdminAn } from "@/lib/verein-anlegen";
import {
  beendeTreuhand,
  starteTreuhand,
  uebergebeVerein,
  vereinVorbereiten as vereinVorbereitenLib,
} from "@/lib/treuhand";
import { erzeugeVorschauLink, widerrufeVorschauLink } from "@/lib/verein-vorschau";
import { sendMail } from "@/lib/mailer";
import { emailAlsHtml, emailAlsText } from "@/lib/email-layout";
import { uebergabeInhalt } from "@/lib/uebergabe-mail";

export async function vereinErstellen(formData: FormData) {
  await requireSystemAdmin();

  const vereinsname = formData.get("vereinsname");
  const adminName = formData.get("adminName");
  const adminEmail = formData.get("adminEmail");

  if (
    typeof vereinsname !== "string" ||
    !vereinsname.trim() ||
    typeof adminName !== "string" ||
    !adminName.trim() ||
    typeof adminEmail !== "string" ||
    !adminEmail.trim()
  ) {
    throw new Error("Bitte alle Felder ausfüllen.");
  }

  await legeVereinMitAdminAn(vereinsname, adminName, adminEmail);

  revalidatePath("/system/vereine");
}

const text = (formData: FormData, name: string) => {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert.trim() : "";
};

// Verein ohne Admin anlegen und direkt zum Einrichten wechseln.
export async function vereinVorbereiten(formData: FormData) {
  const session = await requireSystemAdmin();
  const id = await vereinVorbereitenLib(session.user.id, text(formData, "vereinsname"));
  await starteTreuhand(session.user.id, id, "einrichtung");
  redirect("/admin");
}

// Wechsel in einen Verein: im Vorbereitungs-Modus zum Einrichten, sonst nur
// mit gültiger Support-Freigabe des Vereins (prüft starteTreuhand).
export async function treuhandStarten(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (!v) throw new Error("Verein nicht gefunden.");
  await starteTreuhand(
    session.user.id,
    vereinId,
    v.status === "vorbereitung" ? "einrichtung" : "support"
  );
  redirect("/admin");
}

// "Zurück ins System" (Banner im Admin-Bereich).
export async function treuhandBeenden() {
  const session = await requireSystemAdmin();
  await beendeTreuhand(session.user.id);
  redirect("/system/vereine");
}

// Übergabe an den echten Vereinsadmin: danach hat der Systemadmin keinen
// Zugriff mehr auf den Verein.
export async function vereinUebergeben(formData: FormData) {
  const session = await requireSystemAdmin();
  const { vereinName, adminEmail } = await uebergebeVerein(
    session.user.id,
    text(formData, "vereinId"),
    text(formData, "adminName"),
    text(formData, "adminEmail")
  );
  // Erst nach der Übergabe (Verein ist jetzt aktiv, die Mail-Sperre gilt nicht
  // mehr). Scheitert der Versand, bleibt die Übergabe bestehen.
  try {
    const inhalt = uebergabeInhalt(vereinName, adminEmail);
    await sendMail(
      adminEmail,
      `Dein Verein ${vereinName} ist eingerichtet`,
      emailAlsText(inhalt),
      emailAlsHtml(inhalt)
    );
  } catch (err) {
    console.error("Übergabe-Mail konnte nicht gesendet werden:", err);
  }
  revalidatePath("/system/vereine");
  redirect("/system/vereine");
}

// Geheimer Vorschau-Link für einen Verein in Vorbereitung (Demo für Dritte).
export async function vorschauLinkErzeugen(formData: FormData) {
  const session = await requireSystemAdmin();
  const vereinId = text(formData, "vereinId");
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (v?.status !== "vorbereitung") throw new Error("Nur für Vereine in Vorbereitung.");
  await erzeugeVorschauLink(vereinId, Number(text(formData, "tage")), session.user.email ?? session.user.id);
  revalidatePath("/system/vereine");
}

export async function vorschauLinkWiderrufen(formData: FormData) {
  const session = await requireSystemAdmin();
  await widerrufeVorschauLink(text(formData, "linkId"), session.user.email ?? session.user.id);
  revalidatePath("/system/vereine");
}
